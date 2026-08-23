import type { FieldDefinition } from '../core/field.js';
import type { ModelDefinition } from '../core/model.js';

/**
 * `id`, `createdAt`, `updatedAt` aren't declarable via `field.*` (they're auto-injected, §4),
 * so a model author has no way to mark them `indexed: true` even though "sort by most recent"
 * is close to a universal query need. Treated as implicitly indexed for the filter/sort gate;
 * schema-gen backs this by always adding a plain index on created_at/updated_at (see schema-gen.ts).
 */
const IMPLICIT_INDEXED_COLUMNS = new Set(['id', 'createdAt', 'updatedAt']);

export type ColumnKind = FieldDefinition['kind'] | 'uuid' | 'datetime';

export function isKnownColumn(model: ModelDefinition, key: string): boolean {
  return IMPLICIT_INDEXED_COLUMNS.has(key) || key in model.fields;
}

export function columnKind(model: ModelDefinition, key: string): ColumnKind {
  if (key === 'id') return 'uuid';
  if (key === 'createdAt' || key === 'updatedAt') return 'datetime';
  const f = model.fields[key];
  if (!f) throw new Error(`columnKind: '${key}' is not a field on model '${model.name}'`);
  return f.kind;
}

/** Q10: filtering and sorting share one gate — `indexed: true` (or an implicit column above). json
 * fields are excluded regardless, since a plain btree index doesn't meaningfully serve jsonb querying. */
export function isFilterableOrSortable(model: ModelDefinition, key: string): boolean {
  if (IMPLICIT_INDEXED_COLUMNS.has(key)) return true;
  const f = model.fields[key];
  return !!f && f.indexed === true && f.kind !== 'json';
}

const OPERATORS_BY_KIND: Record<ColumnKind, ReadonlySet<string>> = {
  string: new Set(['=', '!=', 'like', 'is', 'in']),
  text: new Set(['=', '!=', 'like', 'is', 'in']),
  integer: new Set(['=', '!=', '>', '>=', '<', '<=', 'in', 'is']),
  decimal: new Set(['=', '!=', '>', '>=', '<', '<=', 'in', 'is']),
  boolean: new Set(['=', '!=', 'is']),
  datetime: new Set(['=', '!=', '>', '>=', '<', '<=', 'is']),
  enum: new Set(['=', '!=', 'in', 'is']),
  reference: new Set(['=', '!=', 'in', 'is']),
  uuid: new Set(['=', '!=', 'in', 'is']),
  json: new Set([]),
};

/** Q19: operator-vs-field-type is validated before the DB ever sees the query. */
export function isOperatorValidForKind(kind: ColumnKind, op: string): boolean {
  return OPERATORS_BY_KIND[kind]?.has(op) ?? false;
}
