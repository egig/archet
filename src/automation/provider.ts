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

export type ChatStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ChatEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'thinking-delta'; text: string }
  | { type: 'tool-call'; call: ChatToolCall }
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
}

export interface ChatProvider {
  stream(req: ChatRequest): AsyncIterable<ChatEvent>;
}
