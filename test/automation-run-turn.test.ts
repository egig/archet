import { describe, expect, it } from 'bun:test';
import { runAgentTurn } from '../src/automation/run-turn.js';
import type { ChatEvent, ChatProvider, ChatRequest, ChatUsage } from '../src/automation/provider.js';

// `runAgentTurn` normally resolves its `ChatProvider` from a `Provider` DB row (agent.providerId
// -> providerRow.kind -> resolveProvider) and its tool set from a `Role` row (agent.roleId). Both
// seams are test-only overrides on `runAgentTurn`'s own opts (`provider`, `turnTimeoutMs`) —
// `agent.roleId: null` short-circuits `resolveAgentTools` before it ever touches `db` (see
// src/automation/tool.ts), so these tests never need a live database or network call.
function baseOpts(provider: ChatProvider, overrides: Partial<Parameters<typeof runAgentTurn>[0]> = {}) {
  return {
    agent: { name: 'test-agent', providerId: 'unused', roleId: null, model: 'test-model', systemPrompt: 'sys', config: null },
    history: [{ role: 'user' as const, content: 'hello' }],
    db: {} as never,
    request: undefined,
    registry: {},
    provider,
    ...overrides,
  };
}

async function collect(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const event of gen) out.push(event);
  return out;
}

/** A `ChatProvider` whose `stream()` yields one fixed batch of events per call, in order —
 * records every `ChatRequest` it was called with so tests can assert on message-history growth. */
function scriptedProvider(batches: ChatEvent[][]): ChatProvider & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  let i = 0;
  return {
    calls,
    async *stream(req) {
      calls.push(req);
      for (const event of batches[Math.min(i, batches.length - 1)] ?? []) yield event;
      i++;
    },
  };
}

/** A `ChatProvider` that yields one delta then hangs until `req.signal` aborts — simulates a
 * connection that never resolves on its own, whether cancelled by the user or by the turn's own
 * timeout. Both `runAgentTurn`'s abort and timeout paths work by aborting `req.signal`. */
function hangingProvider(): ChatProvider & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return {
    calls,
    async *stream(req) {
      calls.push(req);
      yield { type: 'text-delta', text: 'partial' };
      await new Promise<never>((_, reject) => {
        const fail = () => reject(new DOMException('Aborted', 'AbortError'));
        if (req.signal?.aborted) fail();
        else req.signal?.addEventListener('abort', fail);
      });
    },
  };
}

const usage = (inputTokens: number, outputTokens: number): ChatUsage => ({ inputTokens, outputTokens });

describe('runAgentTurn', () => {
  it('streams text and ends on end_turn with the provider-reported usage', async () => {
    const provider = scriptedProvider([
      [{ type: 'text-delta', text: 'Hi' }, { type: 'done', stopReason: 'end_turn', usage: usage(5, 3) }],
    ]);
    const events = await collect(runAgentTurn(baseOpts(provider)));
    expect(events).toEqual([
      { type: 'text-delta', text: 'Hi' },
      { type: 'done', stopReason: 'end_turn', usage: usage(5, 3) },
    ]);
    expect(provider.calls.length).toBe(1);
  });

  it('feeds an unresolvable tool call back as an error result and continues the loop', async () => {
    // roleId: null -> no tools granted -> any tool call the model makes resolves to "unknown tool".
    const provider = scriptedProvider([
      [
        { type: 'tool-call', call: { id: 'tc1', name: 'whatever', input: {} } },
        { type: 'done', stopReason: 'tool_use', usage: usage(2, 1) },
      ],
      [{ type: 'text-delta', text: 'done' }, { type: 'done', stopReason: 'end_turn', usage: usage(4, 2) }],
    ]);
    const events = await collect(runAgentTurn(baseOpts(provider)));
    expect(events).toEqual([
      { type: 'tool-call', call: { id: 'tc1', name: 'whatever', input: {} } },
      { type: 'tool-result', result: { toolCallId: 'tc1', content: "unknown tool 'whatever'", isError: true } },
      { type: 'text-delta', text: 'done' },
      // usage accumulates across both iterations, not just the last one.
      { type: 'done', stopReason: 'end_turn', usage: usage(6, 3) },
    ]);
    expect(provider.calls.length).toBe(2);
    // the second call's history carries the failed tool round from the first.
    const secondCallMessages = provider.calls[1]!.messages;
    expect(secondCallMessages.at(-2)).toEqual({
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'tc1', name: 'whatever', input: {} }],
    });
    expect(secondCallMessages.at(-1)).toEqual({
      role: 'tool',
      content: '',
      toolResults: [{ toolCallId: 'tc1', content: "unknown tool 'whatever'", isError: true }],
    });
  });

  it('handles a non-object tool-call input (e.g. malformed JSON surfaced as a raw string by parseToolInput) as a graceful per-call error, not an uncaught throw', async () => {
    const provider = scriptedProvider([
      [
        { type: 'tool-call', call: { id: 'tc1', name: 'whatever', input: '{not valid json' } },
        { type: 'done', stopReason: 'tool_use', usage: usage(1, 1) },
      ],
      [{ type: 'text-delta', text: 'ok' }, { type: 'done', stopReason: 'end_turn', usage: usage(1, 1) }],
    ]);
    const events = await collect(runAgentTurn(baseOpts(provider)));
    const result = events.find((e) => e.type === 'tool-result');
    expect(result).toMatchObject({ type: 'tool-result', result: { toolCallId: 'tc1', isError: true } });
    // the loop wasn't derailed by the bad input — it went on to a second round and finished normally.
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'end_turn', usage: usage(2, 2) });
  });

  it('stops at MAX_TOOL_ITERATIONS with an honest stopReason and full accumulated usage, not max_tokens/zeroed', async () => {
    let n = 0;
    const provider: ChatProvider & { calls: number } = {
      calls: 0,
      async *stream() {
        provider.calls++;
        n++;
        yield { type: 'tool-call', call: { id: `tc${n}`, name: 'noop', input: {} } };
        yield { type: 'done', stopReason: 'tool_use', usage: usage(1, 1) };
      },
    };
    const events = await collect(runAgentTurn(baseOpts(provider)));
    expect(provider.calls).toBe(8);
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'max_iterations', usage: usage(8, 8) });
  });

  it('returns immediately with stopReason "aborted" if the signal is already aborted, without calling the provider', async () => {
    const ac = new AbortController();
    ac.abort();
    const provider = scriptedProvider([[{ type: 'text-delta', text: 'never' }]]);
    const events = await collect(runAgentTurn(baseOpts(provider, { abortSignal: ac.signal })));
    expect(events).toEqual([{ type: 'done', stopReason: 'aborted', usage: usage(0, 0) }]);
    expect(provider.calls.length).toBe(0);
  });

  it('aborts a hung mid-stream call when the caller cancels, tearing down via the forwarded signal', async () => {
    const ac = new AbortController();
    const provider = hangingProvider();
    const it = runAgentTurn(baseOpts(provider, { abortSignal: ac.signal }))[Symbol.asyncIterator]();

    const first = await it.next();
    expect(first.value).toEqual({ type: 'text-delta', text: 'partial' });

    ac.abort();
    const second = await it.next();
    expect(second.value).toEqual({ type: 'done', stopReason: 'aborted', usage: usage(0, 0) });
    // the request's own signal was aborted, not just polled after the fact.
    expect(provider.calls[0]!.signal?.aborted).toBe(true);
  });

  it('yields stopReason "timeout" (distinct from "aborted") when the turn budget elapses on a hung call', async () => {
    const provider = hangingProvider();
    const events = await collect(runAgentTurn(baseOpts(provider, { turnTimeoutMs: 20 })));
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'timeout', usage: usage(0, 0) });
  });
});
