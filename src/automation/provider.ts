/**
 * Provider-agnostic chat harness. Nothing outside `src/automation/providers/*` may import
 * `@anthropic-ai/sdk` or `openai` types directly — the router and console only ever talk to
 * `ChatProvider`/`ChatEvent`, so adding a third provider (or swapping one out) never touches
 * anything but its own adapter file.
 */

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema (draft 2020-12-ish subset both Anthropic and OpenAI accept). */
  parameters: Record<string, unknown>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  /** empty string for an assistant turn that only made tool calls. */
  content: string;
  toolCalls?: ChatToolCall[];
  toolResults?: ChatToolResult[];
}

export type ChatStopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_tokens'
  | 'refusal'
  | 'aborted'
  // `runAgentTurn` hit `MAX_TOOL_ITERATIONS` without a final answer — distinct from `max_tokens`
  // (a real length cutoff from the provider) so the console can label it accurately.
  | 'max_iterations'
  // the turn's wall-clock budget elapsed while waiting on the provider.
  | 'timeout';

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ChatEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'thinking-delta'; text: string }
  | { type: 'tool-call'; call: ChatToolCall }
  // emitted by `runAgentTurn` (not by a provider adapter) once it has executed a tool call it
  // previously surfaced — carries the same `toolCallId` so the console can pair them.
  | { type: 'tool-result'; result: ChatToolResult }
  | { type: 'done'; stopReason: ChatStopReason; usage: ChatUsage };

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** provider-specific passthrough (e.g. Anthropic's `effort`) — adapters ignore keys they don't understand. */
  extra?: Record<string, unknown>;
  /** resolved from `Agent.providerId`'s `Provider` row by the caller — never read from the
   * `Agent` row directly. */
  apiKey?: string;
  /** only meaningful to the openai-compatible adapter. */
  baseUrl?: string;
  /** aborts the underlying SDK request (user cancel or `runAgentTurn`'s per-turn timeout) — every
   * adapter must forward this to its SDK client so a hung connection actually gets torn down. */
  signal?: AbortSignal;
}

export interface ChatProvider {
  stream(req: ChatRequest): AsyncIterable<ChatEvent>;
}

/**
 * Parses one tool call's accumulated JSON-fragment input (both adapters stream it as fragments
 * keyed by content-block/tool-call index, then parse once the block closes). On malformed JSON —
 * a provider bug or a truncated stream — returns the raw string instead of throwing: `runAgentTurn`
 * already rejects a non-object `call.input` as a normal tool error fed back to the model, so this
 * turns a would-be uncaught exception (which crashes the whole turn) into that existing, harmless
 * path instead of a special case.
 */
export function parseToolInput(json: string): unknown {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
