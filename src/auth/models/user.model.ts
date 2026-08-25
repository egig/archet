import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { createDefaultWorkspace } from '../../workspace/provisioning.js';
import { hashPassword, requireAuth, requirePermission } from '../pipeline.js';

export const User = defineModel('users', {
  fields: {
    email: field.string({ required: true, unique: true, indexed: true, maxLength: 320 }),
    passwordHash: field.string({ required: true, sensitive: true, writeAs: 'password', displayText: 'Password' }),
    roleId: field.reference('roles', { required: false, indexed: true, displayText: 'Role' }),
    workTitleId: field.reference('work_titles', { required: false, indexed: true, displayText: 'Work Title' }),
    active: field.boolean({ default: true }),
  },
  operations: {
    // admin-driven creation via generic `POST /api/users` — gated like any other model.
    create: pipe(requireAuth, requirePermission('users', 'create'), hashPassword, validate, persist, createDefaultWorkspace),
    update: pipe(requireAuth, requirePermission('users', 'update'), hashPassword, validate, persist),
    remove: pipe(requireAuth, requirePermission('users', 'remove'), persist.remove),
  },
});

/**
 * No auth guard — this is what `POST /api/auth/register` (src/auth/router.ts) runs, so public
 * self-signup isn't blocked by the `users:create` permission that gates admin-driven creation
 * through `User.operations.create` above. `createDefaultWorkspace` still runs last (see
 * `workspace/provisioning.ts`) — a self-registered user has no `workTitleId` yet, so this always
 * provisions the blank default workspace, not a work-title template.
 */
export const registerPipeline = pipe(hashPassword, validate, persist, createDefaultWorkspace);
