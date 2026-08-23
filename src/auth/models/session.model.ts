import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission } from '../pipeline.js';

/**
 * Sessions are created/destroyed by the dedicated `/api/auth/*` routes (`src/auth/router.ts`),
 * never through generic REST — these `operations` exist only so a stray `POST /api/sessions`
 * isn't silently accepted; no default role is granted the 'sessions' permission.
 */
export const Session = defineModel('sessions', {
  fields: {
    userId: field.reference('users', { required: true, indexed: true }),
    token: field.string({ required: true, unique: true, indexed: true, maxLength: 255 }),
    expiresAt: field.datetime({ required: true, indexed: true }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('sessions', 'create'), validate, persist),
    update: pipe(requireAuth, requirePermission('sessions', 'update'), validate, persist),
    remove: pipe(requireAuth, requirePermission('sessions', 'remove'), persist.remove),
  },
  admin: { hidden: true },
});
