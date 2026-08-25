import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlockParam,
  Tool as AnthropicTool,
  StopReason as AnthropicStopReason,
} from '@anthropic-ai/sdk/resources/messages';
import type { ChatEvent, ChatMessage, ChatProvider, ChatRequest, ChatStopReason, ToolSpec } from '../provider.js';

const MAX_TOKENS = 64000;

function toAnthropicTools(tools: ToolSpec[] | undefined): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as AnthropicTool.InputSchema,
  }));
}

function toAnthropicMessages(messages: ChatMessage[]): MessageParam[] {
  return messages.map((m): MessageParam => {
    if (m.role === 'tool') {
      // Anthropic has no 'tool' role — a tool result is a 'user' turn carrying tool_result blocks.
      const blocks: ContentBlockParam[] = (m.toolResults ?? []).map((r) => ({
        type: 'tool_result',
        tool_use_id: r.toolCallId,
        content: r.content,
        is_error: r.isError,
      }));
      return { role: 'user', content: blocks };
    }

    if (m.role === 'assistant' && m.toolCalls?.length) {
      const blocks: ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      }
      return { role: 'assistant', content: blocks };
    }

    return { role: m.role, content: m.content };
  });
}

function mapStopReason(reason: AnthropicStopReason | null): ChatStopReason {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'refusal') return 'refusal';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'end_turn';
}

export const anthropicProvider: ChatProvider = {
  async *stream(req: ChatRequest): AsyncIterable<ChatEvent> {
    const client = new Anthropic(req.apiKey ? { apiKey: req.apiKey } : {});
    const effort = (req.extra?.effort as string | undefined) ?? 'high';

    const stream = client.messages.stream({
      model: req.model,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max' },
      tools: toAnthropicTools(req.tools),
      messages: toAnthropicMessages(req.messages),
    });

    // input_json_delta arrives as fragments of one tool call's JSON input, keyed by content
    // block index — accumulated here and parsed once content_block_stop closes that block.
    const pendingToolCalls = new Map<number, { id: string; name: string; json: string }>();

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        pendingToolCalls.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: '' });
        continue;
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text-delta', text: event.delta.text };
        } else if (event.delta.type === 'thinking_delta') {
          yield { type: 'thinking-delta', text: event.delta.thinking };
        } else if (event.delta.type === 'input_json_delta') {
          const pending = pendingToolCalls.get(event.index);
          if (pending) pending.json += event.delta.partial_json;
        }
        continue;
      }

      if (event.type === 'content_block_stop') {
        const pending = pendingToolCalls.get(event.index);
        if (pending) {
          pendingToolCalls.delete(event.index);
          yield {
            type: 'tool-call',
            call: { id: pending.id, name: pending.name, input: pending.json ? JSON.parse(pending.json) : {} },
          };
        }
      }
    }

    const final = await stream.finalMessage();
    yield {
      type: 'done',
      stopReason: mapStopReason(final.stop_reason),
      usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
    };
  },
};
