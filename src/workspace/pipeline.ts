import { PipelineError, type PipelineFn } from '../core/pipeline.js';
import { fetchRow, insertRow } from '../core/persistence.js';
import type { UserRow } from '../auth/lookup.js';
import { Workspace } from './models/workspace.model.js';

/** Name given to the `Workspace` every new `User` is provisioned with — see
 * `createDefaultWorkspace` below. */
export const DEFAULT_WORKSPACE_NAME = 'My Workspace';

/**
 * Composed onto the end of `User`'s `create` pipelines (`auth/models/user.model.ts`'s
 * `User.operations.create` and `registerPipeline`) so every new account starts with somewhere to
 * open workspace views/chat, instead of the console's workspace switcher (WorkspacePage.tsx)
 * showing empty until the user creates one by hand. Reads `ctx.doc.id` — the just-persisted
 * `User` row's id — rather than `ctx.user`, since `registerPipeline` runs unauthenticated (no
 * `ctx.user` yet) and self-creates the account it should provision for. Runs post-commit (after
 * `persist`, the pipeline's write boundary — core/pipeline.ts), so a failure here can't roll back
 * the user creation itself, and non-transactionally, so it can't be folded into the same insert.
 */
export const createDefaultWorkspace: PipelineFn = async (ctx) => {
  const userId = ctx.doc?.id;
  if (typeof userId !== 'string') return ctx;
  await insertRow(ctx.db, Workspace, { userId, name: DEFAULT_WORKSPACE_NAME });
  return ctx;
};

/** Mirrors `automation/pipeline.ts`'s `assertOwnsChat` — reused both by `requireWorkspaceOwnership`
 * below and by the chat-context injection in `automation/router.ts`, which needs to check the same
 * thing before reading a workspace's views into a turn. */
export function assertOwnsWorkspace(
  workspace: Record<string, unknown> | null,
  user: UserRow,
): asserts workspace is Record<string, unknown> {
  if (!workspace || workspace.userId !== user.id) {
    throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
  }
}

/** `requireOwnsRow('userId')` (core/pipeline.ts) only protects a `WorkspaceView` row's own
 * ownership — it says nothing about whether the `workspaceId` it claims to belong to is actually
 * one of the requesting user's own workspaces. This is what stops a create/update from attaching a
 * view to (or moving it into) someone else's workspace. Must run after `validate` so
 * `ctx.input.workspaceId` is a validated string. */
export const requireWorkspaceOwnership: PipelineFn = async (ctx) => {
  const workspaceId = (ctx.input as { workspaceId?: string }).workspaceId ?? (ctx.doc?.workspaceId as string | undefined);
  if (!workspaceId) return ctx;
  const workspace = await fetchRow(ctx.db, Workspace, workspaceId);
  assertOwnsWorkspace(workspace, ctx.user as unknown as UserRow);
  return ctx;
};
