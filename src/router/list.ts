import { sql, type SQL } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ReferenceFieldDefinition } from '../core/field.js';
import type { ModelDefinition } from '../core/model.js';
import { PipelineError } from '../core/pipeline.js';
import { toSnakeCase } from '../core/naming.js';
import { deriveFileFields, normalizeTimestamps, redactSensitiveFields } from '../core/serialize.js';
import { allColumnKeys } from './columns.js';
import { encodeCursor, type FilterClause, type FilterNode, type ParsedListQuery } from './query.js';

type AnyDb = PgDatabase<any, any, any>;

interface IncludePlan {
  relationName: string;
  fkField: string;
  targetModel: ModelDefinition;
}

function buildIncludePlans(
  model: ModelDefinition,
  registry: Record<string, ModelDefinition>,
  includeNames: string[],
): IncludePlan[] {
  return includeNames.map((relationName) => {
    const fkField = `${relationName}Id`;
    const fieldDef = model.fields[fkField] as ReferenceFieldDefinition;
    const targetModel = registry[fieldDef.targetModel];
    if (!targetModel) {
      throw new Error(`include '${relationName}': target model '${fieldDef.targetModel}' is not in the registry`);
    }
    return { relationName, fkField, targetModel };
  });
}

function filterClauseSql(model: ModelDefinition, clause: FilterClause): SQL {
  const col = sql`t.${sql.identifier(toSnakeCase(clause.field))}`;
  switch (clause.op) {
    case '=':
      return sql`${col} = ${clause.value}`;
    case '!=':
      return sql`${col} != ${clause.value}`;
    case '>':
      return sql`${col} > ${clause.value}`;
    case '>=':
      return sql`${col} >= ${clause.value}`;
    case '<':
      return sql`${col} < ${clause.value}`;
    case '<=':
      return sql`${col} <= ${clause.value}`;
    case 'like':
      return sql`${col} LIKE ${clause.value}`;
    case 'is':
      if (clause.value !== null) {
        throw new PipelineError({
          code: 'INVALID_OPERATOR',
          status: 400,
          fields: { [clause.field]: "'is' only supports a null value" },
        });
      }
      return sql`${col} IS NULL`;
    case 'in': {
      const values = Array.isArray(clause.value) ? clause.value : [clause.value];
      if (values.length === 0) return sql`FALSE`;
      return sql`${col} IN (${sql.join(
        values.map((v) => sql`${v}`),
        sql`, `,
      )})`;
    }
  }
}

function filterNodeSql(model: ModelDefinition, node: FilterNode): SQL {
  if (!('logic' in node)) return filterClauseSql(model, node);
  // an empty group is vacuous: AND of nothing is true, OR of nothing is false.
  if (node.conditions.length === 0) return node.logic === 'and' ? sql`TRUE` : sql`FALSE`;
  const joiner = node.logic === 'and' ? sql` AND ` : sql` OR `;
  return sql`(${sql.join(
    node.conditions.map((c) => filterClauseSql(model, c)),
    joiner,
  )})`;
}

function selectListSql(model: ModelDefinition, includes: IncludePlan[]): SQL {
  const baseCols = allColumnKeys(model).map(
    (key) => sql`t.${sql.identifier(toSnakeCase(key))} AS ${sql.identifier(key)}`,
  );
  const relationCols = includes.flatMap((plan) =>
    allColumnKeys(plan.targetModel).map(
      (key) =>
        sql`${sql.identifier(plan.relationName)}.${sql.identifier(toSnakeCase(key))} AS ${sql.identifier(`${plan.relationName}__${key}`)}`,
    ),
  );
  return sql.join([...baseCols, ...relationCols], sql`, `);
}

function joinSql(model: ModelDefinition, includes: IncludePlan[]): SQL {
  return sql.join(
    includes.map(
      (plan) =>
        sql` LEFT JOIN ${sql.identifier(plan.targetModel.tableName)} AS ${sql.identifier(plan.relationName)} ON t.${sql.identifier(toSnakeCase(plan.fkField))} = ${sql.identifier(plan.relationName)}.${sql.identifier('id')}`,
    ),
    sql``,
  );
}

/** Reassembles `relation__field` aliased columns (see selectListSql) into nested objects. */
function nestRow(model: ModelDefinition, row: Record<string, unknown>, includes: IncludePlan[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const nested: Record<string, Record<string, unknown>> = {};
  for (const plan of includes) nested[plan.relationName] = {};

  for (const [key, value] of Object.entries(row)) {
    const relation = includes.find((p) => key.startsWith(`${p.relationName}__`));
    if (relation) {
      const subKey = key.slice(relation.relationName.length + 2);
      nested[relation.relationName]![subKey] = value;
    } else {
      out[key] = value;
    }
  }
  for (const plan of includes) {
    // a dangling/optional reference with no matching row still joins to all-NULL columns.
    const relRow = nested[plan.relationName]!;
    out[plan.relationName] =
      relRow.id === null
        ? null
        : deriveFileFields(plan.targetModel, redactSensitiveFields(plan.targetModel, normalizeTimestamps(plan.targetModel, relRow)));
  }
  return deriveFileFields(model, redactSensitiveFields(model, normalizeTimestamps(model, out)));
}

export interface OffsetPage {
  mode: 'offset';
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export interface CursorPage {
  mode: 'cursor';
  rows: Record<string, unknown>[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function listRows(
  db: AnyDb,
  model: ModelDefinition,
  registry: Record<string, ModelDefinition>,
  query: ParsedListQuery,
): Promise<OffsetPage | CursorPage> {
  const includes = buildIncludePlans(model, registry, query.include);
  const tableIdent = sql.identifier(model.tableName);

  const whereParts: SQL[] = [];
  if (!query.includeDeleted) whereParts.push(sql`t.deleted_at IS NULL`);
  for (const node of query.filters) whereParts.push(filterNodeSql(model, node));

  if (query.sortField && query.cursor) {
    const sortCol = sql`t.${sql.identifier(toSnakeCase(query.sortField))}`;
    const cmp = query.sortDirection === 'asc' ? sql`>` : sql`<`;
    whereParts.push(
      sql`(${sortCol}, t.id) ${cmp} (${query.cursor.value}, ${query.cursor.id})`,
    );
  }

  const whereSql = whereParts.length > 0 ? sql` WHERE ${sql.join(whereParts, sql` AND `)}` : sql``;
  const joinClause = joinSql(model, includes);
  const selectCols = selectListSql(model, includes);

  let orderSql: SQL;
  if (query.sortField) {
    const dir = query.sortDirection === 'asc' ? sql`ASC` : sql`DESC`;
    orderSql = sql` ORDER BY t.${sql.identifier(toSnakeCase(query.sortField))} ${dir}, t.id ${dir}`;
  } else {
    orderSql = sql` ORDER BY t.created_at DESC, t.id DESC`;
  }

  if (query.sortField) {
    // cursor mode (§5): fetch one extra row to know whether another page exists.
    const rows = (await db.execute(
      sql`SELECT ${selectCols} FROM ${tableIdent} AS t${joinClause}${whereSql}${orderSql} LIMIT ${query.limit + 1}`,
    )) as unknown as Record<string, unknown>[];

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit).map((r) => nestRow(model, r, includes));

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = page[page.length - 1]!;
      nextCursor = encodeCursor({ value: last[query.sortField], id: last.id as string });
    }
    return { mode: 'cursor', rows: page, nextCursor, hasMore };
  }

  const rows = (await db.execute(
    sql`SELECT ${selectCols} FROM ${tableIdent} AS t${joinClause}${whereSql}${orderSql} LIMIT ${query.limit} OFFSET ${query.offset}`,
  )) as unknown as Record<string, unknown>[];

  const countRows = (await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM ${tableIdent} AS t${whereSql}`,
  )) as unknown as { count: number }[];

  return {
    mode: 'offset',
    rows: rows.map((r) => nestRow(model, r, includes)),
    total: countRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getOneRow(
  db: AnyDb,
  model: ModelDefinition,
  registry: Record<string, ModelDefinition>,
  id: string,
  opts: { includeDeleted: boolean; include: string[] },
): Promise<Record<string, unknown> | null> {
  const includes = buildIncludePlans(model, registry, opts.include);
  const tableIdent = sql.identifier(model.tableName);
  const joinClause = joinSql(model, includes);
  const selectCols = selectListSql(model, includes);
  const deletedClause = opts.includeDeleted ? sql`` : sql` AND t.deleted_at IS NULL`;

  const rows = (await db.execute(
    sql`SELECT ${selectCols} FROM ${tableIdent} AS t${joinClause} WHERE t.id = ${id}${deletedClause} LIMIT 1`,
  )) as unknown as Record<string, unknown>[];

  return rows[0] ? nestRow(model, rows[0], includes) : null;
}
