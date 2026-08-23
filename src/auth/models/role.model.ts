import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission } from '../pipeline.js';

export const Role = defineModel('roles', {
  fields: {
    name: field.string({ required: true, unique: true, indexed: true, maxLength: 100 }),
    description: field.text({ required: false }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('roles', 'create'), validate, persist),
    update: pipe(requireAuth, requirePermission('roles', 'update'), validate, persist),
    remove: pipe(requireAuth, requirePermission('roles', 'remove'), persist.remove),
  },
});
