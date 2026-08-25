import { defineModel, field, pipe, validate, persist, requireOwnsRow } from '../../core/index.js';
import { requireAuth, requirePermission } from '../../auth/pipeline.js';

/**
 * A named collection of `WorkspaceView` tabs (workspace-view.model.ts), owned by exactly one
 * user. Unlike `Chat`/`Message` (src/automation/models), this stays reachable through the generic
 * `/api/:model` router — `api: { ownerField: 'userId' }` is what keeps that safe (create-router.ts
 * auto-scopes every read to the requesting user, `requireOwnsRow` below scopes every write) rather
 * than needing a dedicated router.
 */
export const Workspace = defineModel('workspaces', {
  fields: {
    userId: field.reference('users', { required: true, indexed: true, displayText: 'Owner' }),
    name: field.string({ required: true, maxLength: 255 }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('workspaces', 'create'), requireOwnsRow('userId'), validate, persist),
    update: pipe(requireAuth, requirePermission('workspaces', 'update'), requireOwnsRow('userId'), validate, persist),
    remove: pipe(requireAuth, requirePermission('workspaces', 'remove'), requireOwnsRow('userId'), persist.remove),
  },
  console: { label: 'Workspaces', displayField: 'name' },
  api: { ownerField: 'userId' },
});
