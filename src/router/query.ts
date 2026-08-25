import type { ModelDefinition } from '../core/model.js';
import { PipelineError } from '../core/pipeline.js';
import { columnKind, isFilterableOrSortable, isKnownColumn, isOperatorValidForKind } from './fields.js';

export type FilterOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'like' | 'is';
const VALID_OPS: ReadonlySet<string> = new Set(['=', '!=', '>', '>=', '<', '<=', 'in', 'like', 'is']);
const GROUP_LOGICS: ReadonlySet<string> = new Set(['and', 'or']);

export interface FilterClause {
  field: string;
  op: FilterOp;
  value: unknown;
}

export type FilterGroupLogic = 'and' | 'or';

/** One level of `(a AND b)` / `(a OR b)` grouping around plain clauses — deliberately not
 * recursive (no group-of-groups): keeps the wire shape a `zod` union free of `z.lazy`, which
 * `zod-to-json-schema` (automation/tool.ts's LLM tool-schema derivation) can't turn into a clean
 * non-recursive JSON Schema, and keeps `FilterBar`'s UI a single flat level to build by hand. */
export interface FilterGroup {
  logic: FilterGroupLogic;
  conditions: FilterClause[];
}

export type FilterNode = FilterClause | FilterGroup;

export interface CursorState {
  value: unknown;
  id: string;
}

export type SortDirection = 'asc' | 'desc';

export interface ParsedListQuery {
  limit: number;
  offset: number;
  sortField?: string;
  sortDirection: SortDirection;
  cursor?: CursorState;
  includeDeleted: boolean;
  include: string[];
  filters: FilterNode[];
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const RESERVED_PARAMS = new Set(['limit', 'offset', 'sort', 'cursor', 'include', 'filter', 'includeDeleted']);

function parseLimit(raw: string | null): number {
  const n = raw === null ? DEFAULT_LIMIT : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  // Q16: over-the-max is clamped, not rejected — unlike a malformed sort/filter request.
  return Math.min(n, MAX_LIMIT);
}

function parseOffset(raw: string | null): number {
  const n = raw === null ? 0 : Number.parseInt(raw, 10);
  return !Number.isFinite(n) || n < 0 ? 0 : n;
}

function decodeCursor(raw: string): CursorState {
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'value' in decoded &&
      'id' in decoded &&
      typeof (decoded as { id: unknown }).id === 'string'
    ) {
      return { value: (decoded as { value: unknown }).value, id: (decoded as { id: string }).id };
    }
  } catch {
    // fall through to the error below
  }
  throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { cursor: 'malformed cursor' } });
}

export function encodeCursor(state: CursorState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

export function parseInclude(model: ModelDefinition, raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map((name) => {
    const trimmed = name.trim();
    if (trimmed.includes('.')) {
      // Q20: multi-hop/dot-chained include is rejected outright, not silently truncated.
      throw new PipelineError({ code: 'INVALID_INCLUDE', status: 400, fields: { include: `nested include '${trimmed}' is not supported` } });
    }
    // `createdBy` is the one relation name that isn't a declared `field.reference()` — it maps to
    // the auto-injected `createdById` column (core/model.ts, schema-gen.ts) instead of a model field.
    if (trimmed === 'createdBy') return trimmed;
    const fieldKey = `${trimmed}Id`;
    const field = model.fields[fieldKey];
    if (!field || field.kind !== 'reference') {
      throw new PipelineError({ code: 'INVALID_INCLUDE', status: 400, fields: { include: `unknown relation '${trimmed}'` } });
    }
    return trimmed;
  });
}

type RawClause = [string, string, unknown];
type RawGroup = [FilterGroupLogic, RawClause[]];

function parseRawClause(entry: unknown): RawClause {
  if (!Array.isArray(entry) || entry.length !== 3 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
    throw new PipelineError({
      code: 'VALIDATION_ERROR',
      status: 400,
      fields: { filter: 'each entry must be [field, operator, value] or [logic, [clauses]]' },
    });
  }
  return entry as RawClause;
}

function isRawGroup(entry: unknown): entry is RawGroup {
  return Array.isArray(entry) && entry.length === 2 && GROUP_LOGICS.has(entry[0] as string) && Array.isArray(entry[1]);
}

/** Top level stays a flat, implicitly-AND'd array (unchanged wire shape for plain filters); an
 * entry may itself be a `[logic, [clauses]]` group of clauses OR'd/AND'd together, one level deep
 * (see `FilterGroup`'s doc comment on why no group-of-groups). */
function parseStructuredFilters(raw: string | null): (RawClause | RawGroup)[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { filter: 'must be valid JSON' } });
  }
  if (!Array.isArray(parsed)) {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { filter: 'must be an array of [field, operator, value] triples' } });
  }
  return parsed.map((entry) => (isRawGroup(entry) ? [entry[0], entry[1].map(parseRawClause)] : parseRawClause(entry)));
}

function assertFilterable(model: ModelDefinition, field: string): void {
  if (!isKnownColumn(model, field) || !isFilterableOrSortable(model, field)) {
    throw new PipelineError({ code: 'UNFILTERABLE_FIELD', status: 400, fields: { [field]: 'not indexed — cannot be filtered on' } });
  }
}

/** Same underlying gate as assertFilterable (Q10: one `indexed` flag serves both), but §5
 * specifies a distinct error code for the sort case. */
function assertSortable(model: ModelDefinition, field: string): void {
  if (!isKnownColumn(model, field) || !isFilterableOrSortable(model, field)) {
    throw new PipelineError({ code: 'UNSORTABLE_FIELD', status: 400, fields: { [field]: 'not indexed — cannot be sorted on' } });
  }
}

function assertValidOperator(model: ModelDefinition, field: string, op: string): asserts op is FilterOp {
  if (!VALID_OPS.has(op)) {
    throw new PipelineError({ code: 'INVALID_OPERATOR', status: 400, fields: { [field]: `unknown operator '${op}'` } });
  }
  const kind = columnKind(model, field);
  if (!isOperatorValidForKind(kind, op)) {
    throw new PipelineError({ code: 'INVALID_OPERATOR', status: 400, fields: { [field]: `operator '${op}' is not valid for a ${kind} field` } });
  }
}

export function parseListQuery(model: ModelDefinition, searchParams: URLSearchParams): ParsedListQuery {
  // `-field` reverses direction, matching the common REST/JSON:API convention.
  const rawSort = searchParams.get('sort');
  const sortDirection: SortDirection = rawSort?.startsWith('-') ? 'desc' : 'asc';
  const sortField = rawSort ? rawSort.replace(/^-/, '') : undefined;
  if (sortField) assertSortable(model, sortField);

  const cursorRaw = searchParams.get('cursor');
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : undefined;
  if (cursor && !sortField) {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { cursor: 'requires ?sort=<field>' } });
  }

  const filters: FilterNode[] = [];

  for (const entry of parseStructuredFilters(searchParams.get('filter'))) {
    if (isRawGroup(entry)) {
      const [logic, clauses] = entry;
      const conditions = clauses.map(([field, op, value]) => {
        assertFilterable(model, field);
        assertValidOperator(model, field, op);
        return { field, op: op as FilterOp, value };
      });
      filters.push({ logic, conditions });
    } else {
      const [field, op, value] = entry;
      assertFilterable(model, field);
      assertValidOperator(model, field, op);
      filters.push({ field, op: op as FilterOp, value });
    }
  }

  for (const [key, value] of searchParams.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    assertFilterable(model, key);
    filters.push({ field: key, op: '=', value });
  }

  return {
    limit: parseLimit(searchParams.get('limit')),
    offset: parseOffset(searchParams.get('offset')),
    sortField,
    sortDirection,
    cursor,
    includeDeleted: searchParams.get('includeDeleted') === 'true',
    include: parseInclude(model, searchParams.get('include')),
    filters,
  };
}
