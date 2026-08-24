import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission, requireValidPermissionTarget } from '../pipeline.js';

export const Permission = defineModel('permissions', {
  fields: {
    roleId: field.reference('roles', { required: true, indexed: true, displayText: 'Role' }),
    // `modelRef`/`actionRef`, not `field.reference`/`field.enum` — neither the set of valid
    // resources nor the set of valid actions is fixed; both are read from the live registry by
    // `requireValidPermissionTarget` at request time. `allowWildcard` lets either hold '*'.
    resource: field.modelRef({ required: true, indexed: true, allowWildcard: true }),
    action: field.actionRef({ required: true, allowWildcard: true }),
  },
  operations: {
    create: pipe(
      requireAuth,
      requirePermission('permissions', 'create'),
      validate,
      requireValidPermissionTarget,
      persist,
    ),
    update: pipe(
      requireAuth,
      requirePermission('permissions', 'update'),
      validate,
      requireValidPermissionTarget,
      persist,
    ),
    remove: pipe(requireAuth, requirePermission('permissions', 'remove'), persist.remove),
  },
});
