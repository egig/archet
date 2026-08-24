import type { ModelDefinition } from '../core/model.js';

export interface ConsoleFieldMeta {
  key: string;
  /** human-readable label for list-view column headers and form field labels — the field's
   * `displayText` if declared, otherwise the key humanized (e.g. `roleId` -> "Role Id"). */
  label: string;
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

export interface ConsoleModelMeta {
  name: string;
  label: string;
  displayField: string;
  fields: ConsoleFieldMeta[];
  /** this model's real operation names (`Object.keys(model.operations)`, always
   * create/update/remove today) — read by an `actionRef` field's dropdown so it lists actual
   * operations instead of a hardcoded set (see `console/client/fields.tsx`). */
  operationNames: string[];
}

function humanize(name: string): string {
  return name.length === 0 ? name : name.charAt(0).toUpperCase() + name.slice(1);
}

/** Splits a camelCase field key into words and capitalizes the first letter of each — e.g.
 * `roleId` -> "Role Id", `passwordHash` -> "Password Hash". */
function humanizeFieldKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function serializeField(key: string, f: ModelDefinition['fields'][string]): ConsoleFieldMeta {
  const meta: ConsoleFieldMeta = {
    key,
    label: f.displayText ?? humanizeFieldKey(key),
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

/** Picks a fallback `displayField` when the model didn't declare one: the first `string`-kind
 * field in declaration order (typically something like `name` or `title`), or `id` if the model
 * has no string field. */
function inferDisplayField(model: ModelDefinition): string {
  const firstStringField = Object.entries(model.fields).find(([, f]) => f.kind === 'string');
  return firstStringField?.[0] ?? 'id';
}

/** Strips the parts of a `ModelDefinition` that either can't cross the wire (the `operations`
 * pipeline fns, a `json` field's Zod schema) or shouldn't (nothing here reveals more than the
 * declared field shape) — served by `GET /meta/models[/:name]` for the console SPA's sidebar
 * and dynamically-generated list/form views. */
export function serializeModelMeta(model: ModelDefinition): ConsoleModelMeta {
  return {
    name: model.name,
    label: model.console?.label ?? humanize(model.name),
    displayField: model.console?.displayField ?? inferDisplayField(model),
    fields: Object.entries(model.fields).map(([key, f]) => serializeField(key, f)),
    operationNames: Object.keys(model.operations),
  };
}
