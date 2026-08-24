import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { UserRow } from '../auth/lookup.js';
import { resolveProvider } from './providers/index.js';
import { getAgentTool, resolveToolSpecs } from './tool.js';
import type { ChatEvent, ChatMessage, ChatStopReason, ChatToolCall, ChatToolResult, ChatUsage } from './provider.js';

type AnyDb = PgDatabase<any, any, any>;

const MAX_TOOL_ITERATIONS = 8;

/**
 * Runs one user turn against an `Agent` row to completion, including any tool-use rounds —
 * a plain async generator over `ChatEvent`, deliberately independent of HTTP/SSE so it can be
 * consumed identically by the streaming router (src/automation/router.ts) today and, later, by
 * a background/scheduled runner without duplicating the provider-call-and-tool-loop logic.
 */
export async function* runAgentTurn(opts: {
  agent: Record<string, unknown>;
  history: ChatMessage[];
  db: AnyDb;
  user: UserRow;
}): AsyncGenerator<ChatEvent> {
  const { agent } = opts;
  const provider = resolveProvider(agent.provider as string);
  const tools = resolveToolSpecs(agent.allowedTools);
  const apiKeyEnvVar = agent.apiKeyEnvVar as string | undefined;
  const apiKey = apiKeyEnvVar ? process.env[apiKeyEnvVar] : undefined;

  let messages = opts.history;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
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
      baseUrl: (agent.baseUrl as string | null) ?? undefined,
    })) {
      if (event.type === 'text-delta') {
        assistantText += event.text;
        yield event;
      } else if (event.type === 'thinking-delta') {
        yield event;
      } else if (event.type === 'tool-call') {
        calls.push(event.call);
        yield event;
      } else {
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
      const tool = getAgentTool(call.name);
      if (!tool) {
        results.push({ toolCallId: call.id, content: `unknown tool '${call.name}'`, isError: true });
        continue;
      }
      try {
        const input = tool.schema.parse(call.input) as unknown;
        const output = await tool.execute(input, { db: opts.db, user: opts.user });
        results.push({ toolCallId: call.id, content: typeof output === 'string' ? output : JSON.stringify(output) });
      } catch (err) {
        results.push({ toolCallId: call.id, content: err instanceof Error ? err.message : String(err), isError: true });
      }
    }

    messages = [
      ...messages,
      { role: 'assistant', content: assistantText, toolCalls: calls },
      { role: 'tool', content: '', toolResults: results },
    ];
  }

  yield { type: 'done', stopReason: 'max_tokens', usage: { inputTokens: 0, outputTokens: 0 } };
}
