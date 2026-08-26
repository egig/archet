import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { callOperation, listRows, type AuthUser } from './api.js';
import { useModels } from './models.js';
import { useAuth } from './auth.js';
import { WorkspaceTabs } from './WorkspaceTabs.js';
import { WorkspaceChatPanel } from './WorkspaceChatPanel.js';
import { ModelFormDialog } from './ModelFormDialog.js';
import { BrandMark } from './BrandMark.js';

interface WorkspaceOption {
  id: string;
  name: string;
  locked: boolean;
  chatEnabled: boolean;
}

// shared across every workspace — the chat panel's open/closed state is a UI preference, not
// something scoped per workspace.
const CHAT_OPEN_STORAGE_KEY = 'ratchet:workspace-chat-open';

/** Avatar-only account control for the workspace header — click opens a dropdown (email + Log
 * out) instead of showing the email inline, mirroring `Layout`'s sidebar `AccountMenu` but
 * anchored under the avatar rather than above a fixed sidebar footer. */
function UserMenu({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-medium text-white"
      >
        {user.email.slice(0, 2).toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <p className="truncate px-3 py-1.5 text-xs text-gray-500">{user.email}</p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

/** The workspace screen — deliberately outside `Layout` (no left sidebar): just a thin header
 * (a workspace switcher, and — for root admins only — a link back to the console, next to the
 * logged-in user) over the tabs + chat two-pane layout. Reads `:workspaceId` from the
 * route (see ConsoleApp.tsx's sibling route alongside the Layout route).
 *
 * Matched against `workspace/:workspaceId/*` so its own `:model/new`/`:model/:id` sub-routes
 * render the row-create/edit form as a dialog on top of this screen instead of navigating away
 * from it — the tab strip, active tab, and chat panel all stay mounted underneath. */
export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { models } = useModels();
  const { user, logout } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[] | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [chatOpen, setChatOpen] = useState(() => {
    try {
      return localStorage.getItem(CHAT_OPEN_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OPEN_STORAGE_KEY, String(chatOpen));
    } catch {
      // ignore — e.g. private browsing with storage disabled
    }
  }, [chatOpen]);
  // `/` now redirects straight back into the workspace (`IndexRedirect.tsx`), so this link
  // targets the first sidebar model directly — otherwise the "Console" link would just loop in place.
  const consolePath = models[0] ? `/${models[0].name}` : '/';
  // mirrors the server's `hasRootAdmin` check (src/auth/lookup.ts): a `*:*` permission.
  const isRoot = user?.permissions.some((p) => p.resource === '*' && p.action === '*') ?? false;

  // the generic `/api/workspaces` GET is always owner-scoped (`api.ownerField`, create-router.ts),
  // so every row here is one the current user owns — no extra ownership check before showing the
  // lock/unlock control below.
  async function refreshWorkspaces() {
    const page = await listRows('workspaces', { limit: 100, offset: 0 });
    setWorkspaces(page.rows as unknown as WorkspaceOption[]);
  }

  useEffect(() => {
    void refreshWorkspaces().catch(() => setWorkspaces([]));
  }, []);

  if (!workspaceId) return null;

  const activeWorkspace = workspaces?.find((w) => w.id === workspaceId) ?? null;
  // a persistent per-workspace setting (workspace.model.ts's `chatEnabled`), distinct from the
  // per-browser `chatOpen` show/hide toggle — when off, the panel and its toggle are gone entirely.
  const chatAvailable = activeWorkspace?.chatEnabled ?? true;

  // `lock`/`unlock` are custom operations (see workspace.model.ts) — `locked` itself is no longer
  // writable via a plain PATCH (`forbidLockedInUpdate`), so this always goes through one or the
  // other by name rather than PATCHing `{ locked: !locked }`.
  async function toggleLock() {
    if (!activeWorkspace) return;
    await callOperation('workspaces', activeWorkspace.id, activeWorkspace.locked ? 'unlock' : 'lock');
    await refreshWorkspaces();
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <BrandMark />
        </div>

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

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {activeWorkspace && (
            <button
              type="button"
              onClick={() => void toggleLock()}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
            >
              {activeWorkspace.locked ? 'Unlock workspace' : 'Lock workspace'}
            </button>
          )}
          {isRoot && (
            <Link to={consolePath} className="text-sm text-gray-500 hover:text-gray-900">
              Console
            </Link>
          )}
          {user && <UserMenu user={user} onLogout={() => void logout()} />}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <WorkspaceTabs
          workspaceId={workspaceId}
          refreshSignal={refreshSignal}
          chatOpen={chatOpen}
          chatAvailable={chatAvailable}
          onToggleChat={() => setChatOpen((v) => !v)}
          locked={activeWorkspace?.locked ?? false}
        />
        {chatOpen && chatAvailable && (
          <WorkspaceChatPanel workspaceId={workspaceId} onTurnDone={() => setRefreshSignal((n) => n + 1)} />
        )}
      </div>

      <Routes>
        <Route path=":model/new" element={<ModelFormDialog returnTo={`/workspace/${workspaceId}${search}`} />} />
        <Route path=":model/:id" element={<ModelFormDialog returnTo={`/workspace/${workspaceId}${search}`} />} />
      </Routes>
    </div>
  );
}
