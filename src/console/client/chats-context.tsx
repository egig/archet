import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listChats, type ChatSummary } from './api.js';
import { queryKeys } from './query-keys.js';

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

/** Owns the chat list for `WorkspaceChatPanel`'s "History" dropdown, refreshed (via `refresh()`)
 * by `ChatEmptyStateView`/`ChatThreadView` after a turn completes. */
export function ChatsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: queryKeys.chats, queryFn: listChats });

  async function refresh() {
    await refetch();
  }

  return (
    <ChatsContext.Provider
      value={{
        chats: data ?? [],
        loading: isLoading,
        error: error ? (error instanceof Error ? error.message : 'failed to load chats') : null,
        refresh,
      }}
    >
      {children}
    </ChatsContext.Provider>
  );
}
