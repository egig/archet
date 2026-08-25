import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { listRows } from './api.js';

interface WorkspaceOption {
  id: string;
}

/** The console root itself has no dashboard — land on the signed-in user's own `Workspace` (every
 * account is provisioned one on creation, see `workspace/provisioning.ts`'s
 * `createDefaultWorkspace`), so login/setup drop straight into it. `sort: 'createdAt'` picks the
 * oldest one deterministically when a user has more than one. Falls back to the `workspaces`
 * create form for an account with none (e.g. one created before default-workspace provisioning
 * existed) — `Workspace` is a framework built-in, always registered, so `/workspaces/new` is
 * always a valid route, unlike a fallback onto some consumer app's own first sidebar model. */
export function IndexRedirect() {
  // undefined = still loading, null = user has no workspace of their own.
  const [workspaceId, setWorkspaceId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    listRows('workspaces', { limit: 1, offset: 0, sort: 'createdAt' })
      .then((page) => setWorkspaceId((page.rows[0] as unknown as WorkspaceOption | undefined)?.id ?? null))
      .catch(() => setWorkspaceId(null));
  }, []);

  if (workspaceId === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  if (workspaceId) return <Navigate to={`/workspace/${workspaceId}`} replace />;
  return <Navigate to="/workspaces/new" replace />;
}
