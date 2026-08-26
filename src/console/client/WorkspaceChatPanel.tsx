import { useEffect, useRef, useState } from 'react';
import { ChatsProvider, useChats } from './chats-context.js';
import { ChatThreadView } from './ChatThreadView.js';
import { ChatEmptyStateView } from './ChatEmptyStateView.js';
import { ChevronDownIcon, PlusIcon } from './icons.js';
import type { ChatSummary } from './api.js';

/** "History" dropdown in place of a `<select>` — lists every chat, with the active one
 * highlighted, and closes itself on an outside click or a selection. */
function ChatHistoryMenu({
  chats,
  selectedChatId,
  onSelect,
}: {
  chats: ChatSummary[];
  selectedChatId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 rounded border border-gray-300 px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-50"
      >
        <span className="min-w-0 flex-1 truncate">History</span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-80 w-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {chats.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No chats yet</p>}
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect(c.id);
                setOpen(false);
              }}
              className={`block w-full truncate px-3 py-2 text-left text-sm ${
                c.id === selectedChatId ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {c.title || 'Untitled chat'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceChatPanelInner({ workspaceId, onTurnDone }: { workspaceId: string; onTurnDone: () => void }) {
  const { chats, loading, error } = useChats();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 p-2">
        <ChatHistoryMenu chats={chats} selectedChatId={selectedChatId} onSelect={setSelectedChatId} />
        <button
          type="button"
          onClick={() => setSelectedChatId(null)}
          className="flex shrink-0 items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
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

/** The workspace screen's right-side chat panel — the only place chat is surfaced in the console
 * (there's no standalone chat page/route). Built on `ChatsProvider`, `ChatThreadView`, and
 * `ChatEmptyStateView` (chats-context.tsx), laid out narrow with a "History" dropdown listing every
 * chat and a full chat switcher rather than a single fixed thread (Q13). Wraps its own
 * `ChatsProvider` since nothing else provides one. `WorkspacePage` conditionally mounts this at
 * all — the open/closed toggle lives in `WorkspaceTabs`'s tab strip, not in here. */
export function WorkspaceChatPanel({ workspaceId, onTurnDone }: WorkspaceChatPanelProps) {
  return (
    <ChatsProvider>
      <WorkspaceChatPanelInner workspaceId={workspaceId} onTurnDone={onTurnDone} />
    </ChatsProvider>
  );
}
