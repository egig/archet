import { useState } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import { ChatRuntimeProvider, Thread, NewChatBar } from './chat/index.js';

/** Compact thread switcher for the narrow panel — a `<select>` over every non-archived thread,
 * plus whatever is active. The standalone `/automation/chats` page has the full rail (Q19). */
function CompactThreadSwitcher() {
  const aui = useAui();
  const items = useAuiState((s) => s.threads.threadItems);
  const mainId = useAuiState((s) => s.threads.mainThreadId);
  const active = items.filter((t) => t.status === 'regular' || t.id === mainId);
  if (active.length === 0) return null;
  return (
    <select
      value={mainId}
      onChange={(e) => aui.threads.switchToThread(e.target.value)}
      className="w-full border-b border-gray-200 px-2 py-1 text-xs text-gray-600"
    >
      {active.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title || 'New chat'}
        </option>
      ))}
    </select>
  );
}

function WorkspaceChatPanelInner({
  agentId,
  onAgentIdChange,
}: {
  agentId: string | null;
  onAgentIdChange: (id: string) => void;
}) {
  return (
    <>
      <NewChatBar agentId={agentId} onAgentIdChange={onAgentIdChange} />
      <CompactThreadSwitcher />
      <div className="min-h-0 flex-1">
        <Thread emptyHint="Ask the agent about this workspace." />
      </div>
    </>
  );
}

export interface WorkspaceChatPanelProps {
  workspaceId: string;
  /** bumps `WorkspaceTabs`'s `refreshSignal` once a turn completes — the agent may have
   * opened/edited/closed tabs during it (Q6). */
  onTurnDone: () => void;
}

/** The workspace screen's right-side chat panel. Built on the same `ChatRuntimeProvider` /
 * `Thread` as the standalone `/automation/chats` page, laid out narrow with a compact switcher
 * instead of the full thread-list rail. `WorkspacePage` conditionally mounts this at all — the
 * open/closed toggle lives in `WorkspaceTabs`. */
export function WorkspaceChatPanel({ workspaceId, onTurnDone }: WorkspaceChatPanelProps) {
  const [agentId, setAgentId] = useState<string | null>(null);
  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white">
      <ChatRuntimeProvider agentId={agentId} workspaceId={workspaceId} onTurnFinish={onTurnDone}>
        <WorkspaceChatPanelInner agentId={agentId} onAgentIdChange={setAgentId} />
      </ChatRuntimeProvider>
    </aside>
  );
}
