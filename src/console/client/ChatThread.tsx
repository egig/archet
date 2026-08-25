import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { listChatMessages, sendChatMessage, type ChatMessageRow } from './api.js';
import { useChats } from './ChatPage.js';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  pending?: boolean;
}

function toDisplay(row: ChatMessageRow): DisplayMessage {
  // MVP never persists a 'tool'-role row (see Message model, src/automation/models/message.model.ts)
  // but the type allows for it — fall back to 'assistant' rather than narrowing the type unsafely.
  return { id: row.id, role: row.role === 'user' ? 'user' : 'assistant', content: row.content };
}

export function ChatThread() {
  const { chatId } = useParams<{ chatId: string }>();
  const { refresh } = useChats();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    setLoading(true);
    listChatMessages(chatId)
      .then((rows) => !cancelled && setMessages(rows.map(toDisplay)))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!chatId || !draft.trim() || sending) return;
    const text = draft;
    setDraft('');
    setSending(true);
    setError(null);

    setMessages((prev) => [...prev, { id: `local-user-${Date.now()}`, role: 'user', content: text }]);
    const assistantId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', thinking: '', pending: true }]);

    await sendChatMessage(chatId, text, {
      onTextDelta: (delta) => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)));
      },
      onThinkingDelta: (delta) => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, thinking: (m.thinking ?? '') + delta } : m)));
      },
      onDone: () => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
        void refresh();
      },
      onError: (msg) => {
        setError(msg);
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
      },
    });
    setSending(false);
  }

  if (loading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((m) => (
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
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2 border-t border-gray-200 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          disabled={sending}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
