import { NavLink, useNavigate } from 'react-router';
import { useChats } from './ChatPage.js';

export function ChatSidebar() {
  const { chats, loading, error } = useChats();
  const navigate = useNavigate();

  return (
    <aside className="flex w-64 shrink-0 flex-col rounded border border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-3">
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="w-full rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
        >
          + New chat
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {loading && <p className="px-3 py-2 text-xs text-gray-400">Loading…</p>}
        {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
        {chats.map((chat) => (
          <NavLink
            key={chat.id}
            to={`/chat/${chat.id}`}
            className={({ isActive }) =>
              `block truncate px-3 py-2 text-sm ${isActive ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`
            }
          >
            {chat.title || 'Untitled chat'}
          </NavLink>
        ))}
        {!loading && chats.length === 0 && !error && <p className="px-3 py-2 text-xs text-gray-400">No chats yet.</p>}
      </nav>
    </aside>
  );
}
