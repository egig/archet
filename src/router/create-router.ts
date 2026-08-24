import { Hono, type Context } from 'hono';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition } from '../core/model.js';
import type { OperationContext } from '../core/pipeline.js';
import { PipelineError } from '../core/pipeline.js';
import { redactSensitiveFields } from '../core/serialize.js';
import { toErrorResponse } from './errors.js';
import { parseInclude, parseListQuery } from './query.js';
import { getOneRow, listRows } from './list.js';

type AnyDb = PgDatabase<any, any, any>;

function resolveModel(registry: Record<string, ModelDefinition>, name: string): ModelDefinition {
  const model = registry[name];
  if (!model) throw new PipelineError({ code: 'MODEL_NOT_FOUND', status: 404 });
  return model;
}

export async function readJsonBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('not an object');
    }
    return body as Record<string, unknown>;
  } catch {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { body: 'must be a JSON object' } });
  }
}

/**
 * §5 pivot: one generic handler serves every model, dispatching by looking up `:model` in the
 * registry at request time — no per-model generated route files.
 */
export function createApiRouter(registry: Record<string, ModelDefinition>, db: AnyDb): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as never);
  });

  app.get('/:model', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    const query = parseListQuery(model, new URL(c.req.url).searchParams);
    const page = await listRows(db, model, registry, query);

    // §5: `{ data, meta }` always — offset mode gets total/limit/offset, cursor mode gets nextCursor/hasMore.
    if (page.mode === 'offset') {
      return c.json({ data: page.rows, meta: { total: page.total, limit: page.limit, offset: page.offset } });
    }
    return c.json({ data: page.rows, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
  });

  app.get('/:model/:id', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    const searchParams = new URL(c.req.url).searchParams;
    const row = await getOneRow(db, model, registry, c.req.param('id'), {
      includeDeleted: searchParams.get('includeDeleted') === 'true',
      include: parseInclude(model, searchParams.get('include')),
    });
    if (!row) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
    return c.json({ data: row });
  });

  app.post('/:model', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    const input = await readJsonBody(c);
    const ctx: OperationContext = { operation: 'create', input, doc: null, model, db, request: c.req.raw, registry };
    const result = await model.operations.create(ctx);
    return c.json({ data: result.doc && redactSensitiveFields(model, result.doc) }, 201);
  });

  app.patch('/:model/:id', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    const input = await readJsonBody(c);
    const ctx: OperationContext = {
      operation: 'update',
      id: c.req.param('id'),
      input,
      doc: null,
      model,
      db,
      request: c.req.raw,
      registry,
    };
    const result = await model.operations.update(ctx);
    return c.json({ data: result.doc && redactSensitiveFields(model, result.doc) });
  });

  app.delete('/:model/:id', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    const ctx: OperationContext = {
      operation: 'remove',
      id: c.req.param('id'),
      input: {},
      doc: null,
      model,
      db,
      request: c.req.raw,
      registry,
    };
    const result = await model.operations.remove(ctx);
    return c.json({ data: result.doc && redactSensitiveFields(model, result.doc) });
  });

  return app;
}
