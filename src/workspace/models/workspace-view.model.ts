import { z } from 'zod';
import { defineModel, field, pipe, validate, persist, requireOwnsRow } from '../../core/index.js';
import { requireAuth, requirePermission } from '../../auth/pipeline.js';
import { requireWorkspaceOwnership } from '../pipeline.js';

// a bare `field.json()` defaults to an object schema (z.record) — `filters`/`include` are arrays,
// so each needs its own explicit shape (core/validation.ts's `baseSchemaForField` can't infer one).
const filtersSchema = z.array(z.tuple([z.string(), z.string(), z.unknown()]));
const includeSchema = z.array(z.string());

/**
 * One tab in a `Workspace` (workspace.model.ts): a saved filter/sort/columns configuration
 * against one model, in the exact shape `router/query.ts`'s `ParsedListQuery` already consumes —
 * so a view reopens (or an agent-driven edit re-renders) as the identical query a direct
 * `GET /api/:model?filter=...&sort=...` call would run.
 *
 * `userId` is denormalized from the parent `Workspace` (rather than derived through a join) so
 * `api: { ownerField: 'userId' }` can scope reads the same simple way every other owner-scoped
 * model does; `requireWorkspaceOwnership` is what actually stops a view being attached to a
 * workspace this user doesn't own in the first place — `requireOwnsRow` alone only protects the
 * view row's own ownership, not the parent it claims to belong to.
 *
 * `console: { hidden: true }`: managed only through the Workspace screen (console/client's
 * WorkspaceTabs/FilterBar) and agent tool calls (create_workspace_views/... — automation/tool.ts
 * derives these automatically from an AgentPermission grant on 'workspace_views'), never the
 * generic sidebar.
 */
export const WorkspaceView = defineModel('workspace_views', {
  fields: {
    userId: field.reference('users', { required: true, indexed: true, displayText: 'Owner' }),
    workspaceId: field.reference('workspaces', { required: true, indexed: true, displayText: 'Workspace' }),
    targetModel: field.modelRef({ required: true, indexed: true, displayText: 'Model' }),
    label: field.string({ required: true, maxLength: 255 }),
    filters: field.json({ required: false, schema: filtersSchema }),
    sortField: field.string({ required: false, maxLength: 255 }),
    sortDirection: field.enum(['asc', 'desc'], { default: 'asc' }),
    include: field.json({ required: false, schema: includeSchema }),
    limit: field.integer({ default: 20 }),
    order: field.integer({ default: 0, indexed: true }),
  },
  operations: {
    create: pipe(
      requireAuth,
      requirePermission('workspace_views', 'create'),
      requireOwnsRow('userId'),
      validate,
      requireWorkspaceOwnership,
      persist,
    ),
    update: pipe(
      requireAuth,
      requirePermission('workspace_views', 'update'),
      requireOwnsRow('userId'),
      validate,
      requireWorkspaceOwnership,
      persist,
    ),
    remove: pipe(requireAuth, requirePermission('workspace_views', 'remove'), requireOwnsRow('userId'), persist.remove),
  },
  console: { hidden: true },
  api: { ownerField: 'userId' },
});
