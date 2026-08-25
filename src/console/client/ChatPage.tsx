import { Outlet } from 'react-router';
import { ChatsProvider } from './chats-context.js';
import { ChatSidebar } from './ChatSidebar.js';

export { useChats } from './chats-context.js';

/** Lays out the sidebar + active thread side by side — a second, nested sidebar living inside
 * the console's main `<Outlet/>` (Layout.tsx owns the outer one). The chat-list data layer itself
 * lives in `ChatsProvider` (chats-context.tsx), shared with `WorkspaceChatPanel`'s compact layout. */
export function ChatPage() {
  return (
    <ChatsProvider>
      <div className="flex h-[calc(100vh-3rem)] min-h-0 gap-4">
        <ChatSidebar />
        <div className="min-w-0 flex-1 overflow-hidden rounded border border-gray-200 bg-white">
          <Outlet />
        </div>
      </div>
    </ChatsProvider>
  );
}
