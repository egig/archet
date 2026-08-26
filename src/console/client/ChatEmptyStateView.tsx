import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createChatAndSend, listRows } from './api.js';
import { useChats } from './chats-context.js';
import { queryKeys } from './query-keys.js';
import { PaperAirplaneIcon } from './icons.js';

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

/** The "start a new conversation" form shown by `WorkspaceChatPanel` when no chat is selected —
 * `onCreated` just selects the new chat locally (no route involved). */
export function ChatEmptyStateView({ workspaceId, onCreated }: ChatEmptyStateViewProps) {
  const { refresh } = useChats();

  const listParams = useMemo(() => ({ limit: 100, offset: 0 }), []);
  const agentsQuery = useQuery({
    queryKey: queryKeys.rows('agents', listParams),
    queryFn: () => listRows('agents', listParams),
  });
  const agents = ((agentsQuery.data?.rows as unknown as AgentOption[] | undefined) ?? []).filter((a) => a.active);
  const agentsError =
    agentsQuery.error instanceof Error ? agentsQuery.error.message : agentsQuery.error ? 'failed to load agents' : null;

  const [agentId, setAgentId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAgentId((current) => current || agents[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsQuery.data]);

  const createMutation = useMutation({
    mutationFn: async ({ agentId, message }: { agentId: string; message: string }) => {
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
      return createdChatId;
    },
    onSuccess: async (createdChatId) => {
      if (!createdChatId) return;
      await refresh();
      onCreated(createdChatId);
    },
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agentId || !message.trim() || createMutation.isPending) return;
    setError(null);
    await createMutation.mutateAsync({ agentId, message });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm text-gray-500">Start a new conversation</p>

      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-md space-y-3">
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={createMutation.isPending || agents.length === 0}
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
          disabled={createMutation.isPending}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />

        {(error ?? agentsError) && <p className="text-sm text-red-600">{error ?? agentsError}</p>}

        <button
          type="submit"
          disabled={createMutation.isPending || !agentId || !message.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          {createMutation.isPending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
