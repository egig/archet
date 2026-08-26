import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireValidPermissionTarget } from '../pipeline.js';

export const Permission = defineModel('permissions', {
  fields: {
    roleId: field.reference('roles', { required: true, indexed: true, displayText: 'Role' }),
    // `modelRef`/`actionRef`/`fieldRef`, not `field.reference`/`field.enum` — neither the set of
    // valid resources, actions, nor (per-resource) fields is fixed; all three are read from the
    // live registry by `requireValidPermissionTarget` at request time. `allowWildcard` lets any of
    // the three hold '*'. `field` is declared `required: false` here even though it's actually
    // required for a `read`/`create`/`update`/`*` row (and forbidden for `remove`/`lock`/`unlock`)
    // — that's a cross-field constraint depending on this row's own `action`, which a single
    // field's static options can't express, so `requireValidPermissionTarget` enforces it instead.
    resource: field.modelRef({ required: true, indexed: true, allowWildcard: true }),
    action: field.actionRef({ required: true, allowWildcard: true }),
    field: field.fieldRef({ required: false, allowWildcard: true, displayText: 'Field' }),
  },
  operations: {
    // requireAuth/requirePermission('permissions', ...) used to be composed here by hand; the
    // generic router now applies both implicitly to every model (see create-router.ts), so this
    // is just validate + the live resource/action/field check + persist.
    create: pipe(validate, requireValidPermissionTarget, persist),
    update: pipe(validate, requireValidPermissionTarget, persist),
  },
});
