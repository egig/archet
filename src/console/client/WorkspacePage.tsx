import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { listRows } from './api.js';
import { useModels } from './models.js';
import { WorkspaceTabs } from './WorkspaceTabs.js';
import { WorkspaceChatPanel } from './WorkspaceChatPanel.js';

interface WorkspaceOption {
  id: string;
  name: string;
}

/** The workspace screen — deliberately outside `Layout` (no left sidebar): just a thin header
 * (a link back to the console, a workspace switcher) over the tabs + chat two-pane layout. Reads
 * `:workspaceId` from the route (see ConsoleApp.tsx's sibling route alongside the Layout route). */
export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { models } = useModels();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[] | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  // `/` now redirects straight back into the workspace (`IndexRedirect.tsx`), so this link
  // targets the first sidebar model directly — otherwise "← Console" would just loop in place.
  const consolePath = models[0] ? `/${models[0].name}` : '/';

  useEffect(() => {
    listRows('workspaces', { limit: 100, offset: 0 })
      .then((page) => setWorkspaces(page.rows as unknown as WorkspaceOption[]))
      .catch(() => setWorkspaces([]));
  }, []);

  if (!workspaceId) return null;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <Link to={consolePath} className="text-sm text-gray-500 hover:text-gray-900">
          ← Console
        </Link>
        <select
          value={workspaceId}
          onChange={(e) => navigate(`/workspace/${e.target.value}`)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {workspaces?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </header>

      <div className="flex min-h-0 flex-1">
        <WorkspaceTabs workspaceId={workspaceId} refreshSignal={refreshSignal} />
        <WorkspaceChatPanel workspaceId={workspaceId} onTurnDone={() => setRefreshSignal((n) => n + 1)} />
      </div>
    </div>
  );
}
