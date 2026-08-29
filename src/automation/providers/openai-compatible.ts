import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { parseToolInput, type ChatEvent, type ChatMessage, type ChatProvider, type ChatRequest, type ChatStopReason, type ToolSpec } from '../provider.js';

function toOpenAiTools(tools: ToolSpec[] | undefined): ChatCompletionTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function toOpenAiMessages(system: string, messages: ChatMessage[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: 'system', content: system }];

  for (const m of messages) {
    if (m.role === 'tool') {
      // OpenAI wants one 'tool' message per result, each tagged with the call it answers —
      // unlike Anthropic, which bundles them into a single user turn.
      for (const r of m.toolResults ?? []) {
        out.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.content });
      }
      continue;
    }

    if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      });
      continue;
    }

    out.push({ role: m.role, content: m.content });
  }

  return out;
}

function mapFinishReason(reason: string | null): ChatStopReason {
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'content_filter') return 'refusal';
  return 'end_turn';
}

/** Works against any host that speaks OpenAI's `/v1/chat/completions` wire format — OpenAI
 * itself, Azure OpenAI, Groq, Together, Fireworks, OpenRouter, local vLLM/Ollama, etc. No
 * equivalent of Anthropic's adaptive thinking/effort/prompt-caching — `req.extra` is unused. */
export const openAiCompatibleProvider: ChatProvider = {
  async *stream(req: ChatRequest): AsyncIterable<ChatEvent> {
    // the SDK already retries connection errors and 408/409/429/5xx with backoff by default
    // (maxRetries: 2) — set explicitly here so that behavior is visible rather than incidental.
    const client = new OpenAI({ apiKey: req.apiKey, baseURL: req.baseUrl, maxRetries: 3 });

    const stream = await client.chat.completions.create(
      {
        model: req.model,
        messages: toOpenAiMessages(req.system, req.messages),
        tools: toOpenAiTools(req.tools),
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: req.signal },
    );

    // tool_calls deltas arrive as fragments keyed by index, same accumulate-then-parse shape
    // as the Anthropic adapter's input_json_delta handling.
    const pendingToolCalls = new Map<number, { id: string; name: string; json: string }>();
    let finishReason: string | null = null;
    let usage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
      }

      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      if (choice.delta.content) {
        yield { type: 'text-delta', text: choice.delta.content };
      }

      for (const toolCall of choice.delta.tool_calls ?? []) {
        const existing = pendingToolCalls.get(toolCall.index);
        if (!existing) {
          pendingToolCalls.set(toolCall.index, {
            id: toolCall.id ?? '',
            name: toolCall.function?.name ?? '',
            json: toolCall.function?.arguments ?? '',
          });
        } else {
          existing.json += toolCall.function?.arguments ?? '';
        }
      }
    }

    for (const pending of pendingToolCalls.values()) {
      yield { type: 'tool-call', call: { id: pending.id, name: pending.name, input: parseToolInput(pending.json) } };
    }

    yield { type: 'done', stopReason: mapFinishReason(finishReason), usage };
  },
};
