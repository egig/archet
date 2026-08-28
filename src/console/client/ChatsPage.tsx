import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChatRuntimeProvider, Thread, ThreadList, NewChatBar } from './chat/index.js';

/**
 * The standalone Automation → Chats screen (sidebar link from `AutomationDomain.consoleMenu`).
 * Full two-pane assistant-ui layout; shares `ChatRuntimeProvider` with `WorkspaceChatPanel`
 * (Q7). The active thread is mirrored to the URL (`/automation/chats/:threadId`).
 */
export function ChatsPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [agentId, setAgentId] = useState<string | null>(null);

  const onThreadIdChange = useCallback(
    (id: string | undefined) => {
      navigate(id ? `/automation/chats/${id}` : '/automation/chats', { replace: true });
    },
    [navigate],
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <ChatRuntimeProvider agentId={agentId} threadId={threadId} onThreadIdChange={onThreadIdChange}>
        <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200">
          <NewChatBar agentId={agentId} onAgentIdChange={setAgentId} />
          <div className="min-h-0 flex-1">
            <ThreadList />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <Thread emptyHint="Send a message, or start a fresh chat with “New chat”." />
        </div>
      </ChatRuntimeProvider>
    </div>
  );
}
