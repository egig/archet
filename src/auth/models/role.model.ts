import { z } from 'zod';
import { defineModel, field } from '../../core/index.js';
import { setRolePermissions } from '../pipeline.js';

// a bare `field.json()` defaults to an object schema (z.record) — `targets` is an array, so it
// needs its own explicit shape (core/validation.ts's `baseSchemaForField` can't infer one). Mirrors
// `Permission`'s own `resource`/`action`/`field` columns (permission.model.ts) minus `roleId`
// (implied by which role `setPermissions` was called on); `requireValidPermissionTarget`
// (ratchet/auth) — not this schema — is what actually checks each triple against the live
// registry, the same split `Permission.create`/`.update` already rely on.
const permissionTargetSchema = z.object({
  resource: z.string(),
  action: z.string(),
  field: z.string().nullable().optional(),
});

export const Role = defineModel('roles', {
  fields: {
    name: field.string({ required: true, unique: true, indexed: true, maxLength: 100 }),
    description: field.text({ required: false }),
  },
  operations: {
    // The custom operation behind the console's combined "edit role + manage permissions" form
    // (see docs/guide/console.md#custom-forms) — takes this role's *entire* desired grant list in
    // one call (a tree of resource/action/field checkboxes, `*` collapsing a whole subtree into one
    // wildcard row) and diffs it against the role's current `Permission` rows. `console: { placement: [] }`
    // — no default row/detail button — because the raw JSON-params modal the console would
    // otherwise render for this is a poor stand-in for the tree UI; it's only ever meant to be
    // called from that custom form, not invoked generically.
    setPermissions: {
      pipeline: setRolePermissions,
      params: { targets: field.json({ required: true, schema: z.array(permissionTargetSchema) }) },
      console: { label: 'Set Permissions', placement: [] },
    },
  },
});
