import { defineModel, field, pipe, validate, persist, requireOwnsRow, PipelineError, type PipelineFn } from '../../core/index.js';

/** Blocks writes to a `locked` workspace — its structure (its own fields, and via
 * `requireWorkspaceOwnership` in workspace/pipeline.ts, its `WorkspaceView` tabs) is frozen, e.g. so
 * a `WorkTitle`-provisioned workspace can be handed to someone who should only work with the data
 * inside it (see workspace-view.model.ts). The one carve-out: a write whose *only* effect is to
 * flip `locked` itself passes through even on a locked row — that's how a `PATCH { locked: false }`
 * unlocks (there's no separate unlock route; locking is just a normal field write). Must run after
 * `requireOwnsRow` so a non-owner still gets 404, not 403. */
export const requireNotLocked: PipelineFn = (ctx) => {
  const keys = Object.keys(ctx.input);
  const onlyTogglesLock = keys.length === 1 && keys[0] === 'locked';
  if (ctx.doc?.locked && !onlyTogglesLock) {
    throw new PipelineError({ code: 'FORBIDDEN', status: 403 });
  }
  return ctx;
};

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
    // requireAuth/requirePermission used to be composed here by hand; the generic router now
    // applies both implicitly to every model (see create-router.ts). There's no dedicated
    // lock/unlock operation — `locked` is an ordinary field, so a client (or the console's
    // Lock/Unlock button) toggles it with a normal `PATCH { locked: … }`, gated by the same
    // `update` permission + `locked` field grant as any other write. `requireNotLocked` has the
    // carve-out that lets a lone `{ locked: false }` through on an already-locked row.
    create: pipe(requireOwnsRow('userId'), validate, persist),
    update: pipe(requireOwnsRow('userId'), requireNotLocked, validate, persist),
    remove: pipe(requireOwnsRow('userId'), requireNotLocked, persist.remove),
  },
  console: { label: 'Workspaces', displayField: 'name' },
  api: { ownerField: 'userId' },
});
