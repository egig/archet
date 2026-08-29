import { describe, expect, it } from 'bun:test';
import { parseToolInput } from '../src/automation/provider.js';

// Both provider adapters (anthropic.ts, openai-compatible.ts) stream a tool call's input as raw
// JSON-string fragments and parse the whole thing once the block/call closes. An unguarded
// `JSON.parse` there used to throw straight out of the adapter's async generator on malformed or
// truncated JSON — uncaught by `runAgentTurn`, which crashed the entire turn instead of just that
// one tool call. `parseToolInput` centralizes the guard: malformed JSON becomes the raw string
// instead of an object, which `runAgentTurn` already rejects as a normal "input must be an
// object" tool error fed back to the model (see automation-run-turn.test.ts).
describe('parseToolInput', () => {
  it('parses valid JSON', () => {
    expect(parseToolInput('{"a":1}')).toEqual({ a: 1 });
  });

  it('treats an empty fragment as an empty object (no input streamed)', () => {
    expect(parseToolInput('')).toEqual({});
  });

  it('returns the raw string instead of throwing on malformed JSON', () => {
    expect(parseToolInput('{not valid json')).toBe('{not valid json');
  });
});
