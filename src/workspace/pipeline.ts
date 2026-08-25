import { PipelineError, type PipelineFn } from '../core/pipeline.js';
import { fetchRow } from '../core/persistence.js';
import type { UserRow } from '../auth/lookup.js';
import { Workspace } from './models/workspace.model.js';

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
