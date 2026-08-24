import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission } from '../../auth/pipeline.js';

/**
 * One turn in a `Chat` — written only by `/api/chats/*` routes (src/automation/router.ts),
 * never through generic REST (see `Chat`'s comment for why `operations` still exist here).
 */
export const Message = defineModel('messages', {
  fields: {
    chatId: field.reference('chats', { required: true, indexed: true, displayText: 'Chat' }),
    role: field.enum(['user', 'assistant', 'tool'], { required: true, indexed: true }),
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
});
