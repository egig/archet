import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission } from '../../auth/pipeline.js';

/**
 * One turn in a `Chat` — written only by `/api/automation/chats/*` routes
 * (src/automation/router.ts), never through generic REST (see `Chat`'s comment for why
 * `api: { hidden: true }` is what actually enforces that, not just `operations`/permissions).
 */
export const Message = defineModel('messages', {
  fields: {
    chatId: field.reference('chats', { required: true, indexed: true, displayText: 'Chat' }),
    // 'context' (src/automation/router.ts's insertWorkspaceContext) carries a workspace snapshot —
    // never sent to the provider as-is (loadHistory translates it to 'user'), rendered distinctly
    // in the console (ChatThreadView) rather than as a chat bubble.
    role: field.enum(['user', 'assistant', 'tool', 'context'], { required: true, indexed: true }),
    content: field.text({ required: true }),
    // { usage, stopReason, model, toolCalls? } — provider response metadata, not shown to the user.
    metadata: field.json({ required: false }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('messages', 'create'), validate, persist),
    update: pipe(requireAuth, requirePermission('messages', 'update'), validate, persist),
    remove: pipe(requireAuth, requirePermission('messages', 'remove'), persist.remove),
  },
  console: { hidden: true },
  api: { hidden: true },
});
