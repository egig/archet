import { sql, type Name, type SQL } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { FieldDefinition } from './field.js';
import type { ModelDefinition } from './model.js';
import { generateId } from './id.js';
import { rowToCamelCase, toSnakeCase } from './naming.js';
import { normalizeTimestamps } from './serialize.js';

type AnyDb = PgDatabase<any, any, any>;
type Chunk = SQL | Name;

function tableIdent(model: ModelDefinition): Name {
  return sql.identifier(model.tableName);
}

async function execRows(db: AnyDb, query: SQL): Promise<Record<string, unknown>[]> {
  const result = await db.execute(query);
  return result as unknown as Record<string, unknown>[];
}

/**
 * Drizzle's typed `.insert()/.update()` builders serialize values (Date -> ISO string,
 * objects -> JSON) via each column's encoder; going through raw `sql` templates directly
 * (necessary here since these primitives are generic across every model's table) bypasses
 * that, so it has to be done by hand.
 */
function toDriverValue(fieldDef: FieldDefinition | undefined, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (fieldDef?.kind === 'json' && value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

export async function fetchRow(
  db: AnyDb,
  model: ModelDefinition,
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<Record<string, unknown> | null> {
  const deletedClause = opts.includeDeleted ? sql`` : sql` AND ${sql.identifier('deleted_at')} IS NULL`;
  const rows = await execRows(
    db,
    sql`SELECT * FROM ${tableIdent(model)} WHERE ${sql.identifier('id')} = ${id}${deletedClause} LIMIT 1`,
  );
  return rows[0] ? normalizeTimestamps(model, rowToCamelCase(rows[0])) : null;
}

/** Every row in `model` whose `fieldKey` column equals `value` (soft-deleted rows excluded) —
 * e.g. every `WorkspaceView` belonging to one `workspaceId`. `fieldKey` must be a real field on
 * `model`; callers pass a fixed, code-authored key (never raw user input) since there's no
 * `isKnownColumn`-style check here the way `router/query.ts` has for request-driven filters. */
export async function listRowsByField(
  db: AnyDb,
  model: ModelDefinition,
  fieldKey: string,
  value: unknown,
): Promise<Record<string, unknown>[]> {
  const rows = await execRows(
    db,
    sql`SELECT * FROM ${tableIdent(model)} WHERE ${sql.identifier(toSnakeCase(fieldKey))} = ${value} AND ${sql.identifier('deleted_at')} IS NULL`,
  );
  return rows.map((row) => normalizeTimestamps(model, rowToCamelCase(row)));
}

export async function insertRow(
  db: AnyDb,
  model: ModelDefinition,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = generateId();
  const now = new Date();

  const columns: Chunk[] = [sql.identifier('id'), sql.identifier('created_at'), sql.identifier('updated_at')];
  const values: Chunk[] = [sql`${id}`, sql`${now.toISOString()}`, sql`${now.toISOString()}`];

  for (const [key, fieldDef] of Object.entries(model.fields)) {
    const value = key in input ? input[key] : fieldDef.default;
    if (value === undefined) continue;
    columns.push(sql.identifier(toSnakeCase(key)));
    values.push(sql`${toDriverValue(fieldDef, value)}`);
  }

  const rows = await execRows(
    db,
    sql`INSERT INTO ${tableIdent(model)} (${sql.join(columns, sql`, `)}) VALUES (${sql.join(values, sql`, `)}) RETURNING *`,
  );
  const row = rows[0];
  if (!row) throw new Error(`persist: insert into '${model.tableName}' returned no row`);
  return normalizeTimestamps(model, rowToCamelCase(row));
}

export async function updateRow(
  db: AnyDb,
  model: ModelDefinition,
  id: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const now = new Date();
  const setParts: SQL[] = [sql`${sql.identifier('updated_at')} = ${now.toISOString()}`];

  for (const [key, fieldDef] of Object.entries(model.fields)) {
    if (!(key in input)) continue;
    setParts.push(sql`${sql.identifier(toSnakeCase(key))} = ${toDriverValue(fieldDef, input[key])}`);
  }

  const rows = await execRows(
    db,
    sql`UPDATE ${tableIdent(model)} SET ${sql.join(setParts, sql`, `)} WHERE ${sql.identifier('id')} = ${id} AND ${sql.identifier('deleted_at')} IS NULL RETURNING *`,
  );
  return rows[0] ? normalizeTimestamps(model, rowToCamelCase(rows[0])) : null;
}

export async function softRemoveRow(
  db: AnyDb,
  model: ModelDefinition,
  id: string,
): Promise<Record<string, unknown> | null> {
  const now = new Date().toISOString();
  const rows = await execRows(
    db,
    sql`UPDATE ${tableIdent(model)} SET ${sql.identifier('deleted_at')} = ${now}, ${sql.identifier('updated_at')} = ${now} WHERE ${sql.identifier('id')} = ${id} AND ${sql.identifier('deleted_at')} IS NULL RETURNING *`,
  );
  return rows[0] ? normalizeTimestamps(model, rowToCamelCase(rows[0])) : null;
}

export async function hardRemoveRow(db: AnyDb, model: ModelDefinition, id: string): Promise<void> {
  await db.execute(sql`DELETE FROM ${tableIdent(model)} WHERE ${sql.identifier('id')} = ${id}`);
}
