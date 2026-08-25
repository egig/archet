import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { listChats, type ChatSummary } from './api.js';

interface ChatsState {
  chats: ChatSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ChatsContext = createContext<ChatsState | null>(null);

export function useChats(): ChatsState {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error('useChats() must be used inside <ChatsProvider>');
  return ctx;
}

/** Owns the chat list (shared by `ChatSidebar`/`WorkspaceChatPanel` and, via `refresh()`,
 * `ChatEmptyStateView`/`ChatThreadView` after a turn completes) — extracted out of `ChatPage` so
 * both the full-page `/chat` route and the compact `WorkspaceChatPanel` can wrap themselves in the
 * same data layer instead of each fetching the chat list independently. */
export function ChatsProvider({ children }: { children: ReactNode }) {
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

  return <ChatsContext.Provider value={{ chats, loading, error, refresh }}>{children}</ChatsContext.Provider>;
}
