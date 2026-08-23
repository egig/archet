import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { hashPassword, requireAuth, requirePermission } from '../pipeline.js';

export const User = defineModel('users', {
  fields: {
    email: field.string({ required: true, unique: true, indexed: true, maxLength: 320 }),
    passwordHash: field.string({ required: true, sensitive: true }),
    roleId: field.reference('roles', { required: false, indexed: true }),
    active: field.boolean({ default: true }),
  },
  operations: {
    // admin-driven creation via generic `POST /api/users` — gated like any other model.
    create: pipe(requireAuth, requirePermission('users', 'create'), hashPassword, validate, persist),
    update: pipe(requireAuth, requirePermission('users', 'update'), hashPassword, validate, persist),
    remove: pipe(requireAuth, requirePermission('users', 'remove'), persist.remove),
  },
});

/**
 * No auth guard — this is what `POST /api/auth/register` (src/auth/router.ts) runs, so public
 * self-signup isn't blocked by the `users:create` permission that gates admin-driven creation
 * through `User.operations.create` above.
 */
export const registerPipeline = pipe(hashPassword, validate, persist);
