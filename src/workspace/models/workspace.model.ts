import { defineModel, field, pipe, validate, persist, requireOwnsRow, PipelineError, type PipelineFn } from '../../core/index.js';
import { requireAuth, requirePermission } from '../../auth/pipeline.js';

/** Blocks `update`/`remove` while `locked` — the workspace's structure (its own fields, and via
 * `requireWorkspaceOwnership` in workspace/pipeline.ts, its `WorkspaceView` tabs) is frozen, e.g. so
 * a `WorkTitle`-provisioned workspace can be handed to someone who should only work with the data
 * inside it (see workspace-view.model.ts). Deliberately not composed into `lock`/`unlock` below — an
 * already-locked workspace must still accept `unlock`. Must run after `requireOwnsRow` so a
 * non-owner still gets 404, not 403. */
export const requireNotLocked: PipelineFn = (ctx) => {
  if (ctx.doc?.locked) {
    throw new PipelineError({ code: 'FORBIDDEN', status: 403 });
  }
  return ctx;
};

/** Forces `ctx.input` to just `{ locked: value }`, ignoring any client-supplied body — same
 * "server decides, not the request" pattern as `requireOwnsRow` forcing the owner field. Used by
 * the `lock`/`unlock` operations below, each of which is otherwise a normal `validate` + `persist`
 * update. */
export const setLocked = (value: boolean): PipelineFn => (ctx) => ({ ...ctx, input: { locked: value } });

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
    locked: field.boolean({ default: false }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('workspaces', 'create'), requireOwnsRow('userId'), validate, persist),
    update: pipe(
      requireAuth,
      requirePermission('workspaces', 'update'),
      requireOwnsRow('userId'),
      requireNotLocked,
      validate,
      persist,
    ),
    remove: pipe(
      requireAuth,
      requirePermission('workspaces', 'remove'),
      requireOwnsRow('userId'),
      requireNotLocked,
      persist.remove,
    ),
    lock: pipe(requireAuth, requirePermission('workspaces', 'update'), requireOwnsRow('userId'), setLocked(true), validate, persist),
    unlock: pipe(requireAuth, requirePermission('workspaces', 'update'), requireOwnsRow('userId'), setLocked(false), validate, persist),
  },
  console: { label: 'Workspaces', displayField: 'name' },
  api: { ownerField: 'userId' },
});
