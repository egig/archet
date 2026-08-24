import type { ModelDefinition } from '../core/model.js';

export interface AdminFieldMeta {
  key: string;
  kind: string;
  required: boolean;
  unique: boolean;
  indexed: boolean;
  sensitive: boolean;
  default?: unknown;
  /** present only on a sensitive field that's writable under a different key — e.g.
   * `passwordHash` (sensitive, never read back) reports `writeAs: 'password'`. */
  writeAs?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
  values?: readonly string[];
  targetModel?: string;
  allowWildcard?: boolean;
}

export interface AdminModelMeta {
  name: string;
  label: string;
  displayField: string;
  fields: AdminFieldMeta[];
  /** this model's real operation names (`Object.keys(model.operations)`, always
   * create/update/remove today) — read by an `actionRef` field's dropdown so it lists actual
   * operations instead of a hardcoded set (see `admin/client/fields.tsx`). */
  operationNames: string[];
}

function humanize(name: string): string {
  return name.length === 0 ? name : name.charAt(0).toUpperCase() + name.slice(1);
}

function serializeField(key: string, f: ModelDefinition['fields'][string]): AdminFieldMeta {
  const meta: AdminFieldMeta = {
    key,
    kind: f.kind,
    required: f.required,
    unique: f.unique,
    indexed: f.indexed,
    sensitive: f.sensitive,
  };
  if (f.default !== undefined) meta.default = f.default;
  if (f.writeAs) meta.writeAs = f.writeAs;
  if (f.kind === 'string') meta.maxLength = f.maxLength;
  if (f.kind === 'decimal') {
    meta.precision = f.precision;
    meta.scale = f.scale;
  }
  if (f.kind === 'enum') meta.values = f.values;
  if (f.kind === 'reference') meta.targetModel = f.targetModel;
  if (f.kind === 'modelRef' || f.kind === 'actionRef') meta.allowWildcard = f.allowWildcard;
  return meta;
}

/** Strips the parts of a `ModelDefinition` that either can't cross the wire (the `operations`
 * pipeline fns, a `json` field's Zod schema) or shouldn't (nothing here reveals more than the
 * declared field shape) — served by `GET /admin/api/models[/:name]` for the admin SPA's sidebar
 * and dynamically-generated list/form views. */
export function serializeModelMeta(model: ModelDefinition): AdminModelMeta {
  return {
    name: model.name,
    label: model.admin?.label ?? humanize(model.name),
    displayField: model.admin?.displayField ?? 'id',
    fields: Object.entries(model.fields).map(([key, f]) => serializeField(key, f)),
    operationNames: Object.keys(model.operations),
  };
}
