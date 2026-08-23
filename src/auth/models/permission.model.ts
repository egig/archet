import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission } from '../pipeline.js';

export const Permission = defineModel('permissions', {
  fields: {
    roleId: field.reference('roles', { required: true, indexed: true }),
    resource: field.string({ required: true, indexed: true, maxLength: 100 }),
    action: field.enum(['create', 'update', 'remove', 'list', '*'], { required: true }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('permissions', 'create'), validate, persist),
    update: pipe(requireAuth, requirePermission('permissions', 'update'), validate, persist),
    remove: pipe(requireAuth, requirePermission('permissions', 'remove'), persist.remove),
  },
});
