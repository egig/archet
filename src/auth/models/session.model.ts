import { defineModel, field } from '../../core/index.js';

/**
 * Sessions are created/destroyed by the dedicated `/api/auth/*` routes (`src/auth/router.ts`),
 * never through generic REST — plain default `operations` (implicit auth+permission, see
 * `create-router.ts`) is enough to keep a stray `POST /api/sessions` from being silently accepted,
 * since no default role is granted the 'sessions' permission.
 */
export const Session = defineModel('sessions', {
  fields: {
    userId: field.reference('users', { required: true, indexed: true, displayText: 'User' }),
    token: field.string({ required: true, unique: true, indexed: true, maxLength: 255 }),
    expiresAt: field.datetime({ required: true, indexed: true }),
  },
  console: { hidden: true },
});
