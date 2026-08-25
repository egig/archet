import type { PipelineFn } from '../core/pipeline.js';
import { fetchRow, insertRow, listRowsByField } from '../core/persistence.js';
import { WorkTitle } from '../auth/models/work-title.model.js';
import { Workspace } from './models/workspace.model.js';
import { WorkspaceView } from './models/workspace-view.model.js';

/** Name given to the `Workspace` every new `User` with no `workTitleId` is provisioned with — see
 * `createDefaultWorkspace` below. Kept in its own module (not `pipeline.ts`) because
 * `workspace-view.model.ts` already imports `pipeline.ts` for `requireWorkspaceOwnership` —
 * importing `WorkspaceView` back into `pipeline.ts` would make that a real import cycle. */
export const DEFAULT_WORKSPACE_NAME = 'My Workspace';

/** Copies every `WorkspaceView` under `templateWorkspaceId` into `targetWorkspaceId`, owned by
 * `userId` — the label/filter/sort/include/limit/order shape of each tab, minus the template's
 * own id/workspaceId/userId. */
async function cloneWorkspaceViews(
  ctx: Parameters<PipelineFn>[0],
  templateWorkspaceId: string,
  targetWorkspaceId: string,
  userId: string,
): Promise<void> {
  const templateViews = await listRowsByField(ctx.db, WorkspaceView, 'workspaceId', templateWorkspaceId);
  for (const view of templateViews) {
    await insertRow(
      ctx.db,
      WorkspaceView,
      {
        userId,
        workspaceId: targetWorkspaceId,
        targetModel: view.targetModel,
        label: view.label,
        filters: view.filters,
        sortField: view.sortField,
        sortDirection: view.sortDirection,
        include: view.include,
        limit: view.limit,
        order: view.order,
      },
      userId,
    );
  }
}

/**
 * Composed onto the end of `User`'s `create` pipelines (`auth/models/user.model.ts`'s
 * `User.operations.create` and `registerPipeline`) so every new account starts with somewhere to
 * open workspace views/chat, instead of the console's workspace switcher (WorkspacePage.tsx)
 * showing empty until the user creates one by hand. Reads `ctx.doc.id` — the just-persisted
 * `User` row's id — rather than `ctx.user`, since `registerPipeline` runs unauthenticated (no
 * `ctx.user` yet) and self-creates the account it should provision for. Runs post-commit (after
 * `persist`, the pipeline's write boundary — core/pipeline.ts), so a failure here can't roll back
 * the user creation itself, and non-transactionally, so it can't be folded into the same insert.
 *
 * When the new user has a `workTitleId` (`WorkTitle`, `auth/models/work-title.model.ts` — every
 * `WorkTitle` mandates a `workspaceTemplateId`), the provisioned `Workspace` is a clone of that
 * template's tabs rather than a blank one, so the user lands on a view suited to their role.
 * `workTitleId` is optional on `User` (e.g. a self-registered account has none yet), so the blank
 * fallback stays the common case for `/register`.
 */
export const createDefaultWorkspace: PipelineFn = async (ctx) => {
  const userId = ctx.doc?.id;
  if (typeof userId !== 'string') return ctx;

  const workTitleId = ctx.doc?.workTitleId;
  const workTitle = typeof workTitleId === 'string' ? await fetchRow(ctx.db, WorkTitle, workTitleId) : null;

  const workspace = await insertRow(
    ctx.db,
    Workspace,
    { userId, name: typeof workTitle?.name === 'string' ? workTitle.name : DEFAULT_WORKSPACE_NAME },
    userId,
  );

  if (typeof workTitle?.workspaceTemplateId === 'string') {
    await cloneWorkspaceViews(ctx, workTitle.workspaceTemplateId, workspace.id as string, userId);
  }

  return ctx;
};
