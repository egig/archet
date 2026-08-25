import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { listRows } from './api.js';
import { useModels } from './models.js';
import { WorkspaceTabs } from './WorkspaceTabs.js';
import { WorkspaceChatPanel } from './WorkspaceChatPanel.js';
import { ModelFormDialog } from './ModelFormDialog.js';

interface WorkspaceOption {
  id: string;
  name: string;
}

/** The workspace screen — deliberately outside `Layout` (no left sidebar): just a thin header
 * (a link back to the console, a workspace switcher) over the tabs + chat two-pane layout. Reads
 * `:workspaceId` from the route (see ConsoleApp.tsx's sibling route alongside the Layout route).
 *
 * Matched against `workspace/:workspaceId/*` so its own `:model/new`/`:model/:id` sub-routes
 * render the row-create/edit form as a dialog on top of this screen instead of navigating away
 * from it — the tab strip, active tab, and chat panel all stay mounted underneath. */
export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { models } = useModels();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[] | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  // `/` now redirects straight back into the workspace (`IndexRedirect.tsx`), so this link
  // targets the first sidebar model directly — otherwise "← Console" would just loop in place.
  const consolePath = models[0] ? `/${models[0].name}` : '/';
  // the model segment of `:model/new` or `:model/:id`, when the form dialog's sub-route is
  // matched below — read from the URL rather than `useParams` (which only sees params declared on
  // *this* component's own route) so `WorkspaceTabs` can restore the right tab after a refresh.
  const openModel = workspaceId ? location.pathname.split(`/workspace/${workspaceId}/`)[1]?.split('/')[0] : undefined;

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
        <WorkspaceTabs workspaceId={workspaceId} refreshSignal={refreshSignal} initialModel={openModel} />
        <WorkspaceChatPanel workspaceId={workspaceId} onTurnDone={() => setRefreshSignal((n) => n + 1)} />
      </div>

      <Routes>
        <Route path=":model/new" element={<ModelFormDialog returnTo={`/workspace/${workspaceId}`} />} />
        <Route path=":model/:id" element={<ModelFormDialog returnTo={`/workspace/${workspaceId}`} />} />
      </Routes>
    </div>
  );
}
