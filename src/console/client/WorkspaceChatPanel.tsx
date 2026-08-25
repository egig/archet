import { useState } from 'react';
import { ChatsProvider, useChats } from './chats-context.js';
import { ChatThreadView } from './ChatThreadView.js';
import { ChatEmptyStateView } from './ChatEmptyStateView.js';

function WorkspaceChatPanelInner({ workspaceId, onTurnDone }: { workspaceId: string; onTurnDone: () => void }) {
  const { chats, loading, error } = useChats();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 p-2">
        <select
          value={selectedChatId ?? ''}
          onChange={(e) => setSelectedChatId(e.target.value || null)}
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="">New chat…</option>
          {chats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title || 'Untitled chat'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSelectedChatId(null)}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          New
        </button>
      </div>

      {loading && <p className="px-3 py-2 text-xs text-gray-400">Loading…</p>}
      {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}

      <div className="min-h-0 flex-1">
        {selectedChatId ? (
          <ChatThreadView chatId={selectedChatId} workspaceId={workspaceId} onTurnDone={onTurnDone} />
        ) : (
          <ChatEmptyStateView workspaceId={workspaceId} onCreated={setSelectedChatId} />
        )}
      </div>
    </aside>
  );
}

export interface WorkspaceChatPanelProps {
  workspaceId: string;
  /** forwarded to `ChatThreadView` — bumps `WorkspaceTabs`'s `refreshSignal` once a turn
   * completes, since the agent may have opened/edited/closed tabs during it. */
  onTurnDone: () => void;
}

/** Compact right-side chat — reuses the same data layer and view components as the full-page
 * `/chat` route (`ChatsProvider`, `ChatThreadView`, `ChatEmptyStateView`), just laid out narrower
 * with a `<select>` in place of `ChatSidebar`'s list, and a full chat switcher rather than a single
 * fixed thread (Q13). Wraps its own `ChatsProvider` since it isn't nested inside `ChatPage`. */
export function WorkspaceChatPanel({ workspaceId, onTurnDone }: WorkspaceChatPanelProps) {
  return (
    <ChatsProvider>
      <WorkspaceChatPanelInner workspaceId={workspaceId} onTurnDone={onTurnDone} />
    </ChatsProvider>
  );
}
