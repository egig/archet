import { defineModel, field, pipe, validate, persist, requireOwnsRow, PipelineError, type PipelineFn } from '../../core/index.js';

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
    // requireAuth/requirePermission used to be composed here by hand; the generic router now
    // applies both implicitly to every model (see create-router.ts) — including `lock`/`unlock`
    // as their own distinct actions, rather than the old hand-rolled pipelines piggybacking on
    // 'update' for both. A role now needs an explicit 'lock'/'unlock' grant, not just 'update'.
    create: pipe(requireOwnsRow('userId'), validate, persist),
    update: pipe(requireOwnsRow('userId'), requireNotLocked, validate, persist),
    remove: pipe(requireOwnsRow('userId'), requireNotLocked, persist.remove),
    lock: pipe(requireOwnsRow('userId'), setLocked(true), validate, persist),
    unlock: pipe(requireOwnsRow('userId'), setLocked(false), validate, persist),
  },
  console: { label: 'Workspaces', displayField: 'name' },
  api: { ownerField: 'userId' },
});
