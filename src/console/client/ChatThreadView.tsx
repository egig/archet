import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listChatMessages, sendChatMessage, type ChatMessageRow } from './api.js';
import { useChats } from './chats-context.js';
import { queryKeys } from './query-keys.js';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'context';
  content: string;
  thinking?: string;
  pending?: boolean;
}

function toDisplay(row: ChatMessageRow): DisplayMessage {
  // MVP never persists a 'tool'-role row (see Message model, src/automation/models/message.model.ts)
  // but the type allows for it — fall back to 'assistant' rather than narrowing the type unsafely.
  const role = row.role === 'context' ? 'context' : row.role === 'user' ? 'user' : 'assistant';
  return { id: row.id, role, content: row.content };
}

export interface ChatThreadViewProps {
  chatId: string;
  /** the currently open workspace, when this thread is embedded in `WorkspaceChatPanel` —
   * threaded into every message so the server injects a fresh context snapshot each turn
   * (automation/router.ts's `insertWorkspaceContext`). Omitted on the plain `/chat` page. */
  workspaceId?: string;
  /** called once a turn's SSE 'done' arrives — lets `WorkspaceTabs` refetch, since the agent may
   * have opened/edited/closed tabs mid-turn via its create_workspace_views/... tools. */
  onTurnDone?: () => void;
}

/** Renders one chat thread's messages and composer, given a `chatId` — used by `WorkspaceChatPanel`
 * (chatId from local state, no route involved). */
export function ChatThreadView({ chatId, workspaceId, onTurnDone }: ChatThreadViewProps) {
  const { refresh } = useChats();
  const queryClient = useQueryClient();

  const messagesQuery = useQuery({
    queryKey: queryKeys.chatMessages(chatId),
    queryFn: () => listChatMessages(chatId),
  });

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesQuery.data) setMessages(messagesQuery.data.map(toDisplay));
  }, [chatId, messagesQuery.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      setMessages((prev) => [...prev, { id: `local-user-${Date.now()}`, role: 'user', content: text }]);
      const assistantId = `local-assistant-${Date.now()}`;
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', thinking: '', pending: true }]);

      await sendChatMessage(
        chatId,
        text,
        {
          onTextDelta: (delta) => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)));
          },
          onThinkingDelta: (delta) => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, thinking: (m.thinking ?? '') + delta } : m)));
          },
          onDone: () => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
          },
          onError: (msg) => {
            setError(msg);
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
          },
        },
        workspaceId,
      );
    },
    onSuccess: () => {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(chatId) });
      onTurnDone?.();
    },
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sendMutation.isPending) return;
    const text = draft;
    setDraft('');
    setError(null);
    await sendMutation.mutateAsync(text);
  }

  if (messagesQuery.isLoading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((m) => {
          if (m.role === 'context') {
            return (
              <details key={m.id} className="mb-4 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <summary className="cursor-pointer">Workspace snapshot</summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{m.content}</pre>
              </details>
            );
          }
          return (
            <div key={m.id} className={`mb-4 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'
                }`}
              >
                {m.role === 'assistant' && m.thinking && (
                  <details className="mb-1 text-xs text-gray-500">
                    <summary className="cursor-pointer">Thinking</summary>
                    <p className="whitespace-pre-wrap">{m.thinking}</p>
                  </details>
                )}
                {m.content || (m.pending ? '…' : '')}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2 border-t border-gray-200 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          disabled={sendMutation.isPending}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={sendMutation.isPending || !draft.trim()}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
