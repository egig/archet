import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { createDefaultWorkspace } from '../../workspace/provisioning.js';
import { hashPassword } from '../pipeline.js';

export const User = defineModel('users', {
  fields: {
    email: field.string({ required: true, unique: true, indexed: true, maxLength: 320 }),
    passwordHash: field.string({ required: true, sensitive: true, writeAs: 'password', displayText: 'Password' }),
    roleId: field.reference('roles', { required: false, indexed: true, displayText: 'Role' }),
    workTitleId: field.reference('work_titles', { required: false, indexed: true, displayText: 'Work Title' }),
    active: field.boolean({ default: true }),
  },
  operations: {
    // admin-driven creation via generic `POST /api/users` — implicitly gated like any other model
    // (see create-router.ts), same as every operation below.
    create: pipe(hashPassword, validate, persist, createDefaultWorkspace),
    update: pipe(hashPassword, validate, persist),
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
