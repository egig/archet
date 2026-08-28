import { useState } from 'react';
import { ChatRuntimeProvider } from './chat/index.js';
import { ChatPanelBody } from './WorkspaceChatPanel.js';

/** The console shell's right-side chat panel — a persistent, collapsible assistant-ui chat mounted
 * by `Layout` for every signed-in console user (no workspace scope). Shares `ChatPanelBody` with
 * `WorkspaceChatPanel`; unlike that one it has no `workspaceId` to send with each turn, so the
 * agent has no workspace-tabs snapshot to act on (see `chat/runtime.tsx`). The close control lives
 * in `Layout`'s header (the chat toggle), so the panel itself needs no header. */
export function ConsoleChatPanel() {
  const [agentId, setAgentId] = useState<string | null>(null);
  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white">
      <ChatRuntimeProvider agentId={agentId}>
        <ChatPanelBody agentId={agentId} onAgentIdChange={setAgentId} />
      </ChatRuntimeProvider>
    </aside>
  );
}
