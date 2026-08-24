import { Hono, type Context } from 'hono';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { FileFieldDefinition } from '../core/field.js';
import type { ModelDefinition } from '../core/model.js';
import type { OperationContext } from '../core/pipeline.js';
import { PipelineError } from '../core/pipeline.js';
import { generateId } from '../core/id.js';
import { fetchRow } from '../core/persistence.js';
import { deriveFileFields, redactSensitiveFields } from '../core/serialize.js';
import {
  DEFAULT_MAX_FILE_SIZE,
  matchesAccept,
  sniffMimeType,
  type FileStorageAdapter,
  type StoredFile,
} from '../core/storage.js';
import { toErrorResponse } from './errors.js';
import { parseInclude, parseListQuery } from './query.js';
import { getOneRow, listRows } from './list.js';

type AnyDb = PgDatabase<any, any, any>;

function resolveModel(registry: Record<string, ModelDefinition>, name: string): ModelDefinition {
  const model = registry[name];
  if (!model) throw new PipelineError({ code: 'MODEL_NOT_FOUND', status: 404 });
  return model;
}

function resolveFileField(model: ModelDefinition, key: string): FileFieldDefinition {
  const f = model.fields[key];
  if (!f || f.kind !== 'file') {
    throw new PipelineError({ code: 'NOT_FOUND', status: 404, message: `'${key}' is not a file field on '${model.name}'` });
  }
  return f;
}

/** Applies `redactSensitiveFields` + `deriveFileFields` to every row on its way out — the one
 * place a raw persisted row becomes an HTTP-safe one (Q12: a `file` field's storage `key` must
 * never reach a client). */
function toResponseRow(model: ModelDefinition, row: Record<string, unknown>): Record<string, unknown> {
  return deriveFileFields(model, redactSensitiveFields(model, row));
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

function fileFieldsOf(model: ModelDefinition): [string, FileFieldDefinition][] {
  return Object.entries(model.fields).filter((e): e is [string, FileFieldDefinition] => e[1].kind === 'file');
}

function storedFileOf(row: Record<string, unknown> | null, key: string): StoredFile | undefined {
  const value = row?.[key];
  return value && typeof value === 'object' ? (value as StoredFile) : undefined;
}

/** Q10: eager, best-effort cleanup — once `newDoc` (already committed) no longer references a
 * `file` field's old blob, the old blob is deleted from storage. Deliberately does *not* run on
 * remove: `persist.remove` is a soft delete (the row, and its file references, still exist —
 * matching how a soft-deleted row also still holds its unique-constrained values, see
 * schema-gen.ts), so there's nothing orphaned yet. A delete failure is logged, not thrown — the
 * record write already committed and must not be rolled back over a storage-side cleanup issue. */
async function cleanupReplacedFiles(
  storage: FileStorageAdapter | undefined,
  model: ModelDefinition,
  oldDoc: Record<string, unknown> | null,
  newDoc: Record<string, unknown>,
): Promise<void> {
  if (!storage || !oldDoc) return;
  for (const [key] of fileFieldsOf(model)) {
    const oldFile = storedFileOf(oldDoc, key);
    const newFile = storedFileOf(newDoc, key);
    if (oldFile && oldFile.key !== newFile?.key) {
      try {
        await storage.delete(oldFile.key);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`cleanupReplacedFiles: failed to delete '${oldFile.key}' (model '${model.name}', field '${key}')`, err);
      }
    }
  }
}

function requireStorage(storage: FileStorageAdapter | undefined): FileStorageAdapter {
  if (!storage) {
    throw new PipelineError({
      code: 'INTERNAL',
      status: 500,
      message: 'this app has a `file` field but no FileStorageAdapter was passed to createApiRouter',
    });
  }
  return storage;
}

function contentDisposition(file: StoredFile): string {
  const safeName = file.filename.replace(/["\r\n]/g, '');
  const disposition = file.mimeType.startsWith('image/') ? 'inline' : 'attachment';
  return `${disposition}; filename="${safeName}"`;
}

/**
 * §5 pivot: one generic handler serves every model, dispatching by looking up `:model` in the
 * registry at request time — no per-model generated route files.
 *
 * `storage` is only required if some model in `registry` has a `file` field — see
 * `FileStorageAdapter` (core/storage.ts). Constructor-injected the same way `createConsoleRouter`
 * takes a `ConsoleAssetSource`: a storage backend isn't always resolvable from a plain config
 * value (e.g. Cloudflare R2 is an `env`-injected binding), so the app's own entry file builds and
 * passes in whichever adapter fits its deploy target.
 */
export function createApiRouter(registry: Record<string, ModelDefinition>, db: AnyDb, storage?: FileStorageAdapter): Hono {
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

  // `GET /:model/:id/:field` — the only way a client ever reads a `file` field's bytes back
  // (Q9/Q12: the record's own JSON response only ever carries this route's URL, never the raw
  // storage key). Reuses `getOneRow` so a soft-deleted record's file 404s the same way the
  // record itself does; there's no separate read-permission system in this framework to layer on
  // top of (creates/updates/removes are the only operations a model's pipeline can gate).
  app.get('/:model/:id/:field', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    resolveFileField(model, c.req.param('field'));
    const row = await getOneRow(db, model, registry, c.req.param('id'), { includeDeleted: false, include: [] });
    if (!row) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
    const stored = storedFileOf(row, c.req.param('field'));
    if (!stored) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });

    const blob = await requireStorage(storage).get(stored.key);
    if (!blob) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
    return new Response(blob.data as BodyInit, {
      headers: { 'content-type': blob.mimeType, 'content-disposition': contentDisposition(stored) },
    });
  });

  // `POST /:model/:field/upload` — the two-step upload flow (Q3): this stores the blob and hands
  // back a `StoredFile` reference; the client then sends that reference as the field's normal
  // create/update value. No id — a "new record" form uploads before the record exists.
  //
  // Deliberately unauthenticated by default, same as every other route in this router (a model
  // gains auth only by composing `requireAuth`/`requirePermission` into its own `operations`
  // pipeline — see `ratchet/auth`). There's no equivalent composition point for this route today,
  // so an anonymous caller can currently store an orphaned blob even if they could never attach
  // it to a real record (blocked by the model's own create/update permission check, if any) —
  // `maxSize` bounds the resulting storage cost but this is a known gap, not a design choice.
  app.post('/:model/:field/upload', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    const field = resolveFileField(model, c.req.param('field'));

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { file: 'required (multipart field "file")' } });
    }

    const maxSize = field.maxSize ?? DEFAULT_MAX_FILE_SIZE;
    if (file.size > maxSize) {
      throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { file: `exceeds ${maxSize} byte limit` } });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = sniffMimeType(bytes, file.type);
    if (field.accept && !matchesAccept(mimeType, field.accept)) {
      throw new PipelineError({
        code: 'VALIDATION_ERROR',
        status: 400,
        fields: { file: `must match '${field.accept}' (detected '${mimeType}')` },
      });
    }

    const key = `${model.name}/${c.req.param('field')}/${generateId()}`;
    await requireStorage(storage).put(key, bytes, { mimeType });

    const stored: StoredFile = { key, filename: file.name, mimeType, size: bytes.byteLength };
    return c.json({ data: stored }, 201);
  });

  app.post('/:model', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    const input = await readJsonBody(c);
    const ctx: OperationContext = { operation: 'create', input, doc: null, model, db, request: c.req.raw, registry };
    const result = await model.operations.create(ctx);
    return c.json({ data: result.doc && toResponseRow(model, result.doc) }, 201);
  });

  app.patch('/:model/:id', async (c) => {
    const model = resolveModel(registry, c.req.param('model'));
    const input = await readJsonBody(c);
    const oldDoc = fileFieldsOf(model).length > 0 ? await fetchRow(db, model, c.req.param('id')) : null;
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
    if (result.doc) await cleanupReplacedFiles(storage, model, oldDoc, result.doc);
    return c.json({ data: result.doc && toResponseRow(model, result.doc) });
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
    return c.json({ data: result.doc && toResponseRow(model, result.doc) });
  });

  return app;
}
