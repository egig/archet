import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission } from '../../auth/pipeline.js';

/**
 * A conversation thread. Created/read/appended-to only through the dedicated
 * `/api/chats/*` routes (src/automation/router.ts), which scope every read to the
 * requesting user — the generic `/api/:model` router has no row-level ownership check, only
 * `requirePermission`'s role/global grants. `operations` below exist only so a stray
 * `POST /api/chats` through generic REST isn't silently accepted; no default role is granted
 * the 'chats' permission (mirrors `Session`, src/auth/models/session.model.ts).
 */
export const Chat = defineModel('chats', {
  fields: {
    userId: field.reference('users', { required: true, indexed: true, displayText: 'User' }),
    agentId: field.reference('agents', { required: true, indexed: true, displayText: 'Agent' }),
    title: field.string({ required: false, maxLength: 255 }),
    status: field.enum(['active', 'archived'], { default: 'active', indexed: true }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('chats', 'create'), validate, persist),
    update: pipe(requireAuth, requirePermission('chats', 'update'), validate, persist),
    remove: pipe(requireAuth, requirePermission('chats', 'remove'), persist.remove),
  },
  console: { hidden: true },
});
