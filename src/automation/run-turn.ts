import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition } from '../core/index.js';
import { fetchRow } from '../core/persistence.js';
import { resolveProvider } from './providers/index.js';
import { resolveAgentTools, executeAgentTool, type AgentTool } from './tool.js';
import { Provider } from './models/index.js';
import type { ChatEvent, ChatMessage, ChatProvider, ChatStopReason, ChatToolCall, ChatToolResult, ChatUsage } from './provider.js';

type AnyDb = PgDatabase<any, any, any>;

const MAX_TOOL_ITERATIONS = 8;

// Generous wall-clock budget for one whole turn (all tool-use rounds included) — bounds a hung
// provider connection, which otherwise holds the request open indefinitely (no SDK-level
// timeout is set, and the client can only end things by disconnecting).
const TURN_TIMEOUT_MS = 10 * 60 * 1000;

function addUsage(a: ChatUsage, b: ChatUsage): ChatUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

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
  /** test-only seam: bypasses `Provider` row / `resolveProvider` lookup and calls this directly.
   * Never set by production callers (`router.ts`) — `resolveProvider` stays the only production
   * path, so a bad `providerId`/`kind` still fails exactly as before. Lets the loop's own control
   * flow (iteration cap, usage accumulation, abort/timeout handling) be unit-tested with a fake
   * `ChatProvider` instead of a live LLM API. */
  provider?: ChatProvider;
  /** test-only override for `TURN_TIMEOUT_MS`, so the timeout path doesn't need a real 10-minute wait. */
  turnTimeoutMs?: number;
}): AsyncGenerator<ChatEvent> {
  const { agent, abortSignal } = opts;

  let provider: ChatProvider;
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  if (opts.provider) {
    provider = opts.provider;
  } else {
    const providerRow = await fetchRow(opts.db, Provider, agent.providerId as string);
    if (!providerRow) {
      throw new Error(`agent '${agent.name as string}' references a provider that no longer exists`);
    }
    provider = resolveProvider(providerRow.kind as string);
    apiKey = providerRow.apiKey as string;
    baseUrl = (providerRow.url as string | null) ?? undefined;
  }

  const agentTools = await resolveAgentTools(opts.db, opts.registry, agent.roleId as string | null);
  const toolsByName = new Map(agentTools.map((t) => [t.spec.name, t] as const));
  const tools = agentTools.map((t) => t.spec);

  let messages = opts.history;
  let totalUsage: ChatUsage = { inputTokens: 0, outputTokens: 0 };
  const deadline = Date.now() + (opts.turnTimeoutMs ?? TURN_TIMEOUT_MS);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (abortSignal?.aborted) {
      yield { type: 'done', stopReason: 'aborted', usage: totalUsage };
      return;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      yield { type: 'done', stopReason: 'timeout', usage: totalUsage };
      return;
    }

    // one AbortController per LLM call, tripped by either the caller's own signal (user hit
    // stop) or this iteration's slice of the turn's overall deadline — `provider.stream` forwards
    // it straight to the SDK client so a hung connection actually gets torn down, not just ignored.
    const callController = new AbortController();
    const onCallerAbort = () => callController.abort();
    abortSignal?.addEventListener('abort', onCallerAbort);
    const timer = setTimeout(() => callController.abort(), remainingMs);

    const calls: ChatToolCall[] = [];
    let assistantText = '';
    let stopReason: ChatStopReason = 'end_turn';
    let usage: ChatUsage = { inputTokens: 0, outputTokens: 0 };

    try {
      for await (const event of provider.stream({
        model: agent.model as string,
        system: agent.systemPrompt as string,
        messages,
        tools,
        extra: (agent.config as Record<string, unknown> | null) ?? undefined,
        apiKey,
        baseUrl,
        signal: callController.signal,
      })) {
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
    } catch (err) {
      if (callController.signal.aborted) {
        yield { type: 'done', stopReason: abortSignal?.aborted ? 'aborted' : 'timeout', usage: totalUsage };
        return;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onCallerAbort);
    }

    totalUsage = addUsage(totalUsage, usage);

    if (stopReason !== 'tool_use' || calls.length === 0) {
      yield { type: 'done', stopReason, usage: totalUsage };
      return;
    }

    const results: ChatToolResult[] = [];
    for (const call of calls) {
      let result: ChatToolResult;
      const tool: AgentTool | undefined = toolsByName.get(call.name);
      if (!tool) {
        result = { toolCallId: call.id, content: `unknown tool '${call.name}'`, isError: true };
      } else if (typeof call.input !== 'object' || call.input === null) {
        result = { toolCallId: call.id, content: `'${call.name}' input must be an object`, isError: true };
      } else {
        try {
          const output = await executeAgentTool(tool, call.input as Record<string, unknown>, {
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

  yield { type: 'done', stopReason: 'max_iterations', usage: totalUsage };
}
