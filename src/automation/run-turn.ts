import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition } from '../core/index.js';
import { fetchRow } from '../core/persistence.js';
import { resolveProvider } from './providers/index.js';
import { resolveAgentTools, executeModelOperationTool, type ModelOperationTool } from './tool.js';
import { Provider } from './models/index.js';
import type { ChatEvent, ChatMessage, ChatStopReason, ChatToolCall, ChatToolResult, ChatUsage } from './provider.js';

type AnyDb = PgDatabase<any, any, any>;

const MAX_TOOL_ITERATIONS = 8;

/**
 * Runs one user turn against an `Agent` row to completion, including any tool-use rounds —
 * a plain async generator over `ChatEvent`. `request` is the chat's own HTTP request, forwarded
 * unchanged into every granted tool call (src/automation/tool.ts) so each one re-authenticates
 * and re-checks permissions as the same user who's chatting, exactly like a direct `/api/:model`
 * call would — a tool call can never do more than that user could already do over the REST API.
 */
export async function* runAgentTurn(opts: {
  agent: Record<string, unknown>;
  history: ChatMessage[];
  db: AnyDb;
  request: Request | undefined;
  registry: Record<string, ModelDefinition>;
  /** the chat request's own signal — checked between tool iterations and provider chunks so a
   * client hitting stop ends the turn cleanly (the router still persists whatever streamed, with
   * `stopReason: 'aborted'`). A tool call already dispatched is not rolled back. */
  abortSignal?: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  const { agent, abortSignal } = opts;

  const providerRow = await fetchRow(opts.db, Provider, agent.providerId as string);
  if (!providerRow) {
    throw new Error(`agent '${agent.name as string}' references a provider that no longer exists`);
  }
  const provider = resolveProvider(providerRow.kind as string);
  const agentTools = await resolveAgentTools(opts.db, opts.registry, agent.id as string);
  const toolsByName = new Map(agentTools.map((t) => [t.spec.name, t] as const));
  const tools = agentTools.map((t) => t.spec);

  const apiKey = providerRow.apiKey as string;
  const baseUrl = (providerRow.url as string | null) ?? undefined;

  let messages = opts.history;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (abortSignal?.aborted) {
      yield { type: 'done', stopReason: 'aborted', usage: { inputTokens: 0, outputTokens: 0 } };
      return;
    }
    const calls: ChatToolCall[] = [];
    let assistantText = '';
    let stopReason: ChatStopReason = 'end_turn';
    let usage: ChatUsage = { inputTokens: 0, outputTokens: 0 };

    for await (const event of provider.stream({
      model: agent.model as string,
      system: agent.systemPrompt as string,
      messages,
      tools,
      extra: (agent.config as Record<string, unknown> | null) ?? undefined,
      apiKey,
      baseUrl,
    })) {
      if (abortSignal?.aborted) {
        yield { type: 'done', stopReason: 'aborted', usage };
        return;
      }
      if (event.type === 'text-delta') {
        assistantText += event.text;
        yield event;
      } else if (event.type === 'thinking-delta') {
        yield event;
      } else if (event.type === 'tool-call') {
        calls.push(event.call);
        yield event;
      } else if (event.type === 'done') {
        stopReason = event.stopReason;
        usage = event.usage;
      }
    }

    if (stopReason !== 'tool_use' || calls.length === 0) {
      yield { type: 'done', stopReason, usage };
      return;
    }

    const results: ChatToolResult[] = [];
    for (const call of calls) {
      let result: ChatToolResult;
      const tool: ModelOperationTool | undefined = toolsByName.get(call.name);
      if (!tool) {
        result = { toolCallId: call.id, content: `unknown tool '${call.name}'`, isError: true };
      } else if (typeof call.input !== 'object' || call.input === null) {
        result = { toolCallId: call.id, content: `'${call.name}' input must be an object`, isError: true };
      } else {
        try {
          const output = await executeModelOperationTool(tool, call.input as Record<string, unknown>, {
            db: opts.db,
            request: opts.request,
            registry: opts.registry,
          });
          result = { toolCallId: call.id, content: typeof output === 'string' ? output : JSON.stringify(output) };
        } catch (err) {
          result = { toolCallId: call.id, content: err instanceof Error ? err.message : String(err), isError: true };
        }
      }
      results.push(result);
      yield { type: 'tool-result', result };
    }

    messages = [
      ...messages,
      { role: 'assistant', content: assistantText, toolCalls: calls },
      { role: 'tool', content: '', toolResults: results },
    ];
  }

  yield { type: 'done', stopReason: 'max_tokens', usage: { inputTokens: 0, outputTokens: 0 } };
}
