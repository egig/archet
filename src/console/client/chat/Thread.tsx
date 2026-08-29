import { useState } from 'react';
import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  useAuiState,
  type ToolCallMessagePartProps,
  type ReasoningMessagePartProps,
} from '@assistant-ui/react';
import { MarkdownText } from './MarkdownText.js';
import { useAgents } from './AgentPicker.js';
import { PaperAirplaneIcon, StopIcon, SparklesIcon, ToolIcon, ChevronDownIcon } from '../icons.js';

function ReasoningPart({ text }: ReasoningMessagePartProps) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="mb-2 rounded border border-gray-200 bg-gray-50 text-xs text-gray-500">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1 text-left"
      >
        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        Thinking
      </button>
      {open && <p className="whitespace-pre-wrap px-2 pb-2 pl-6">{text}</p>}
    </div>
  );
}

function ToolCallPart({ toolName, args, result, isError, status }: ToolCallMessagePartProps) {
  const [open, setOpen] = useState(false);
  const running = status?.type === 'running';
  return (
    <div className="mb-2 rounded-md border border-gray-200 bg-white text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-gray-600"
      >
        <ToolIcon className={`h-3.5 w-3.5 shrink-0 ${isError ? 'text-red-500' : 'text-gray-400'}`} />
        <span className="font-mono text-gray-800">{toolName}</span>
        <span className="text-gray-400">
          {running ? 'running…' : isError ? 'failed' : 'done'}
        </span>
        <ChevronDownIcon className={`ml-auto h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="space-y-1 border-t border-gray-100 px-2 py-1.5">
          <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-gray-500">
            {JSON.stringify(args ?? {}, null, 2)}
          </pre>
          {result !== undefined && (
            <pre
              className={`overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-1.5 text-[11px] ${
                isError ? 'text-red-600' : 'text-gray-600'
              }`}
            >
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const STOP_REASON_NOTICE: Record<string, string> = {
  aborted: 'Stopped',
  max_tokens: 'Response was cut off (length limit)',
  refusal: 'The model declined to answer',
  error: 'The agent turn failed',
  max_iterations: 'Stopped after too many tool-call rounds',
  timeout: 'The agent turn timed out',
};

/** Shown in place of the assistant bubble during the gap between "user hit send" and the first
 * streamed token/tool-call — otherwise nothing in the viewport changes except the composer's
 * Send button swapping for Stop, which reads as the UI having done nothing. */
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1.5" aria-label="Thinking">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
    </div>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-start">
      <div className="max-w-[85%] min-w-0">
        <div className="rounded-lg bg-gray-100 px-3 py-2 text-gray-900">
          {/* the newest assistant message is added (empty, status "running") the instant a turn
              starts, before any network response — this fills that gap instead of an empty bubble. */}
          <MessagePrimitive.If last hasContent={false}>
            <ThreadPrimitive.If running>
              <ThinkingIndicator />
            </ThreadPrimitive.If>
          </MessagePrimitive.If>
          <MessagePrimitive.Parts
            components={{
              Text: MarkdownText,
              Reasoning: ReasoningPart,
              tools: { Fallback: ToolCallPart },
            }}
          />
        </div>
        <MessageMetadataFooter />
      </div>
    </MessagePrimitive.Root>
  );
}

/** Muted footer on assistant messages: model id always, a stop-reason notice when the turn
 * ended early, token usage on hover (Q18). Reads `metadata.custom` — the `{ stopReason, usage,
 * model }` blob persisted on the `Message` row and re-hydrated by the history adapter. */
function MessageMetadataFooter() {
  const custom = useAuiState(
    (s) => s.message.metadata?.custom as { stopReason?: string; model?: string; usage?: { inputTokens?: number; outputTokens?: number } } | undefined,
  );
  if (!custom) return null;
  const notice = custom.stopReason && custom.stopReason !== 'end_turn' ? STOP_REASON_NOTICE[custom.stopReason] : null;
  const usage = custom.usage;
  return (
    <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-gray-400">
      {custom.model && <span>{custom.model}</span>}
      {usage && (
        <span title={`${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out tokens`}>
          · {(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)} tok
        </span>
      )}
      {notice && <span className="text-amber-600">· {notice}</span>}
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-gray-900 px-3 py-2 text-sm whitespace-pre-wrap text-white">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-gray-200 p-3">
      <ComposerPrimitive.Input
        autoFocus
        placeholder="Message…"
        className="max-h-40 flex-1 resize-none rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
      />
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send
          className="flex h-9 items-center gap-1.5 rounded bg-gray-900 px-3 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
          aria-label="Send message"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel
          className="flex h-9 items-center gap-1.5 rounded border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
          aria-label="Stop"
        >
          <StopIcon className="h-4 w-4" />
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  );
}

/** The agent answering the open chat — from the active thread's `custom.agentId` (set by the
 * `RemoteThreadListAdapter`, resolved to a name here). Hidden for a not-yet-created thread. */
function ChatAgentHeader() {
  const agentId = useAuiState(
    (s) => (s.optional.threadListItem?.custom as { agentId?: string } | undefined)?.agentId,
  );
  const { nameById } = useAgents();
  if (!agentId) return null;
  return (
    <div className="flex items-center gap-1.5 border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
      <SparklesIcon className="h-3.5 w-3.5 text-gray-400" />
      <span className="truncate font-medium text-gray-700">{nameById.get(agentId) ?? 'Unknown agent'}</span>
    </div>
  );
}

/** One chat thread — assistant-ui `Thread` primitives styled to the console palette. Branch /
 * edit / regenerate affordances are deliberately omitted (Q14). */
export function Thread({ emptyHint = 'Send a message to start.' }: { emptyHint?: string }) {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-white">
      <ChatAgentHeader />
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-4">
        <ThreadPrimitive.Empty>
          <div className="flex h-full items-center justify-center text-sm text-gray-400">{emptyHint}</div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}
