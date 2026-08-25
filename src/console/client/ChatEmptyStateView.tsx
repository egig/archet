import { useEffect, useState, type FormEvent } from 'react';
import { createChatAndSend, listRows } from './api.js';
import { useChats } from './chats-context.js';

interface AgentOption {
  id: string;
  name: string;
  active: boolean;
}

export interface ChatEmptyStateViewProps {
  /** the currently open workspace, when embedded in `WorkspaceChatPanel` — threaded into the
   * first message the same way `ChatThreadView` threads it into every later one. */
  workspaceId?: string;
  onCreated: (chatId: string) => void;
}

/** The prop-driven core of the "start a new conversation" form — extracted so both the routed
 * `ChatEmptyState` (navigates to the new chat) and `WorkspaceChatPanel` (just selects it locally)
 * render the exact same thing. */
export function ChatEmptyStateView({ workspaceId, onCreated }: ChatEmptyStateViewProps) {
  const { refresh } = useChats();

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRows('agents', { limit: 100, offset: 0 })
      .then((page) => {
        const active = (page.rows as unknown as AgentOption[]).filter((a) => a.active);
        setAgents(active);
        setAgentId((current) => current || active[0]?.id || '');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'failed to load agents'));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agentId || !message.trim() || sending) return;
    setSending(true);
    setError(null);

    let createdChatId: string | null = null;
    await createChatAndSend(
      agentId,
      message,
      {
        onTextDelta: () => {},
        onThinkingDelta: () => {},
        onDone: (info) => {
          createdChatId = info.chatId;
        },
        onError: (msg) => setError(msg),
      },
      workspaceId,
    );

    setSending(false);
    if (createdChatId) {
      await refresh();
      onCreated(createdChatId);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm text-gray-500">Start a new conversation</p>

      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-md space-y-3">
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={sending || agents.length === 0}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {agents.length === 0 && <option value="">No agents available</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message…"
          disabled={sending}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={sending || !agentId || !message.trim()}
          className="w-full rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
