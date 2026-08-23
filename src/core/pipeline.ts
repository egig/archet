import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition } from './model.js';
import { buildCreateSchema, buildUpdateSchema } from './validation.js';
import { fetchRow, hardRemoveRow, insertRow, softRemoveRow, updateRow } from './persistence.js';

export type Operation = 'create' | 'update' | 'remove';

type AnyDb = PgDatabase<any, any, any>;

export interface OperationContext {
  operation: Operation;
  /** id of the record being acted on; required for update/remove, absent for create */
  id?: string;
  /** the pending write payload — mutated by business logic before `persist` runs */
  input: Record<string, unknown>;
  /** the record as it existed before this operation; null on create, auto-prefetched otherwise */
  doc: Record<string, unknown> | null;
  model: ModelDefinition;
  db: AnyDb;
  request?: Request;
  /** the authenticated user, resolved by `requireAuth` (archet/auth) and read by
   * `requirePermission`/business logic — absent until an auth pipeline step sets it. */
  user?: Record<string, unknown> | null;
}

export interface PipelineErrorOptions {
  code: string;
  status: number;
  message?: string;
  fields?: Record<string, string>;
}

export class PipelineError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;

  constructor(opts: PipelineErrorOptions) {
    super(opts.message ?? opts.code);
    this.name = 'PipelineError';
    this.code = opts.code;
    this.status = opts.status;
    this.fields = opts.fields;
  }
}

export type PipelineFn = (ctx: OperationContext) => OperationContext | Promise<OperationContext>;

// Q21b: `persist` / `persist.remove` / `persist.hardRemove` are the one place pipe() needs
// positional awareness of a link's identity — they mark the boundary between the transactional
// (pre-write) and post-commit (post-write) portions of a pipeline. Everything else in `pipe()`
// treats links as opaque functions.
const writeBoundaries = new WeakSet<PipelineFn>();
function markWriteBoundary<T extends PipelineFn>(fn: T): T {
  writeBoundaries.add(fn);
  return fn;
}

export function pipe(...fns: PipelineFn[]): PipelineFn {
  const boundaryIndex = fns.findIndex((fn) => writeBoundaries.has(fn));
  const preBoundary = boundaryIndex === -1 ? fns : fns.slice(0, boundaryIndex + 1);
  const postBoundary = boundaryIndex === -1 ? [] : fns.slice(boundaryIndex + 1);

  return async function runPipeline(initialCtx: OperationContext): Promise<OperationContext> {
    const topDb = initialCtx.db;

    const afterCommit = await topDb.transaction(async (tx) => {
      let current: OperationContext = { ...initialCtx, db: tx as AnyDb };

      // Q3/Q22: auto-prefetch is the transaction's first statement, so every read downstream
      // (business logic and the eventual write) sees one consistent view of the row.
      if (current.operation !== 'create' && current.doc === null) {
        if (!current.id) {
          throw new PipelineError({ code: 'NOT_FOUND', status: 404, message: 'no id provided for update/remove' });
        }
        const doc = await fetchRow(current.db, current.model, current.id);
        if (!doc) {
          throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
        }
        current = { ...current, doc };
      }

      for (const fn of preBoundary) {
        current = await fn(current);
      }
      return current;
    });

    // Q11/Q21b: steps after the write boundary run post-commit, non-transactionally — a
    // failure here does not roll back the already-committed write.
    let current: OperationContext = { ...afterCommit, db: topDb };
    for (const fn of postBoundary) {
      current = await fn(current);
    }
    return current;
  };
}

export const validate: PipelineFn = async (ctx) => {
  const schema = ctx.operation === 'create' ? buildCreateSchema(ctx.model) : buildUpdateSchema(ctx.model);
  const result = schema.safeParse(ctx.input);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      if (!(key in fields)) fields[key] = issue.message;
    }
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields });
  }
  return { ...ctx, input: result.data as Record<string, unknown> };
};

interface PersistFn {
  (ctx: OperationContext): Promise<OperationContext>;
  remove: PipelineFn;
  hardRemove: PipelineFn;
}

const persistWrite: PipelineFn = async (ctx) => {
  if (ctx.operation === 'create') {
    const doc = await insertRow(ctx.db, ctx.model, ctx.input);
    return { ...ctx, doc };
  }
  if (!ctx.id) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
  const doc = await updateRow(ctx.db, ctx.model, ctx.id, ctx.input);
  if (!doc) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
  return { ...ctx, doc };
};

const persistRemove: PipelineFn = async (ctx) => {
  if (!ctx.id) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
  const doc = await softRemoveRow(ctx.db, ctx.model, ctx.id);
  if (!doc) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
  return { ...ctx, doc };
};

const persistHardRemove: PipelineFn = async (ctx) => {
  if (!ctx.id) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
  await hardRemoveRow(ctx.db, ctx.model, ctx.id);
  return { ...ctx, doc: null };
};

markWriteBoundary(persistWrite);
markWriteBoundary(persistRemove);
markWriteBoundary(persistHardRemove);

export const persist = persistWrite as PersistFn;
persist.remove = persistRemove;
persist.hardRemove = persistHardRemove;
