import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { listChats, type ChatSummary } from './api.js';
import { ChatSidebar } from './ChatSidebar.js';

interface ChatsState {
  chats: ChatSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ChatsContext = createContext<ChatsState | null>(null);

export function useChats(): ChatsState {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error('useChats() must be used inside <ChatPage>');
  return ctx;
}

/** Owns the chat list (shared by `ChatSidebar` and, via `refresh()`, `ChatEmptyState`/`ChatThread`
 * after a turn completes) and lays out the sidebar + active thread side by side — a second,
 * nested sidebar living inside the console's main `<Outlet/>` (Layout.tsx owns the outer one). */
export function ChatPage() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setChats(await listChats());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load chats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ChatsContext.Provider value={{ chats, loading, error, refresh }}>
      <div className="flex h-[calc(100vh-3rem)] min-h-0 gap-4">
        <ChatSidebar />
        <div className="min-w-0 flex-1 overflow-hidden rounded border border-gray-200 bg-white">
          <Outlet />
        </div>
      </div>
    </ChatsContext.Provider>
  );
}
