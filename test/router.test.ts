import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { defineModel, field } from '../src/core/index.js';
import { createApiRouter } from '../src/router/create-router.js';

const connectionString = process.env.DATABASE_URL;
const describeIfDb = connectionString ? describe : describe.skip;

describeIfDb('createApiRouter (against a live Postgres)', () => {
  let client: postgres.Sql;
  let db: PgDatabase<any, any, any>;
  let app: ReturnType<typeof createApiRouter>;

  const Author = defineModel('authors', {
    fields: {
      name: field.string({ required: true, indexed: true }),
    },
  });

  const Book = defineModel('books', {
    fields: {
      authorId: field.reference('authors', { required: true, indexed: true }),
      title: field.string({ required: true }),
      price: field.decimal({ precision: 10, scale: 2, required: true }),
      status: field.enum(['draft', 'published'], { default: 'draft', indexed: true }),
    },
  });

  beforeAll(async () => {
    client = postgres(connectionString!);
    db = drizzle(client) as unknown as PgDatabase<any, any, any>;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS authors (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz, created_by_id uuid,
        name varchar NOT NULL
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS books (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz, created_by_id uuid,
        author_id uuid NOT NULL, title varchar NOT NULL, price numeric(10,2) NOT NULL, status varchar NOT NULL DEFAULT 'draft'
      )`);
    app = createApiRouter({ authors: Author, books: Book }, db);
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE books, authors`);
  });

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS books`);
    await db.execute(sql`DROP TABLE IF EXISTS authors`);
    await client.end();
  });

  async function createAuthor(name: string): Promise<string> {
    const res = await app.request('/authors', { method: 'POST', body: JSON.stringify({ name }), headers: { 'content-type': 'application/json' } });
    const body = (await res.json()) as { data: { id: string } };
    return body.data.id;
  }

  it('POST creates a record and returns { data } with 201', async () => {
    const authorId = await createAuthor('Ada');
    const res = await app.request('/books', {
      method: 'POST',
      body: JSON.stringify({ authorId, title: 'Notes', price: '19.99' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ title: 'Notes', price: '19.99', status: 'draft' });
    expect(body.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // Q25/serialize.ts: ISO 8601, not driver text
  });

  it('GET /:model/:id returns { data }, 404 NOT_FOUND for a missing id', async () => {
    const authorId = await createAuthor('Grace');
    const ok = await app.request(`/authors/${authorId}`);
    expect(ok.status).toBe(200);

    const missing = await app.request('/authors/00000000-0000-7000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: 'NOT_FOUND' } });
  });

  it('unknown model -> 404 MODEL_NOT_FOUND', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'MODEL_NOT_FOUND' } });
  });

  it('a model declared with `api: { hidden: true }` 404s on every verb, same as an unknown model', async () => {
    // no table needed — `resolveModel` 404s before any query runs (see create-router.ts).
    const Secret = defineModel('secrets', {
      fields: { value: field.string({ required: true }) },
      api: { hidden: true },
    });
    const hiddenApp = createApiRouter({ authors: Author, secrets: Secret }, db);

    const list = await hiddenApp.request('/secrets');
    expect(list.status).toBe(404);
    expect(await list.json()).toEqual({ error: { code: 'MODEL_NOT_FOUND' } });

    const create = await hiddenApp.request('/secrets', {
      method: 'POST',
      body: JSON.stringify({ value: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(create.status).toBe(404);
  });

  it('list envelope is { data, meta: { total, limit, offset } } by default', async () => {
    await createAuthor('A');
    await createAuthor('B');
    const res = await app.request('/authors');
    const body = (await res.json()) as { data: unknown[]; meta: Record<string, unknown> };
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ total: 2, limit: 20, offset: 0 });
  });

  it('?limit= is clamped to the max, not rejected (Q16)', async () => {
    const res = await app.request('/authors?limit=99999');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { limit: number } };
    expect(body.meta.limit).toBe(100);
  });

  it('equality filter on an indexed field narrows results', async () => {
    const a1 = await createAuthor('Filter Author 1');
    await app.request('/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorId: a1, title: 'X', price: '1.00', status: 'published' }) });
    await app.request('/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorId: a1, title: 'Y', price: '2.00' }) });

    const res = await app.request('/books?status=published');
    const body = (await res.json()) as { data: { status: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.status).toBe('published');
  });

  it('filtering a non-indexed field -> 400 UNFILTERABLE_FIELD', async () => {
    const res = await app.request('/books?title=X');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('UNFILTERABLE_FIELD');
  });

  it('sorting a non-indexed field -> 400 UNSORTABLE_FIELD (distinct code from filter)', async () => {
    const res = await app.request('/books?sort=title');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('UNSORTABLE_FIELD');
  });

  it('an operator invalid for the field kind -> 400 INVALID_OPERATOR', async () => {
    const res = await app.request('/books?filter=' + encodeURIComponent(JSON.stringify([['status', 'like', '%x%']])));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_OPERATOR');
  });

  it('sort mode returns a cursor envelope, and the cursor pages forward without repeats', async () => {
    const a = await createAuthor('Sort Author');
    for (const [title, status] of [['b1', 'draft'], ['b2', 'published'], ['b3', 'draft']] as const) {
      await app.request('/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorId: a, title, price: '1.00', status }) });
    }

    const page1 = await app.request('/books?sort=status&limit=2');
    const body1 = (await page1.json()) as { data: { title: string }[]; meta: { nextCursor: string | null; hasMore: boolean } };
    expect(body1.data).toHaveLength(2);
    expect(body1.meta.hasMore).toBe(true);
    expect(body1.meta.nextCursor).not.toBeNull();

    const page2 = await app.request(`/books?sort=status&limit=2&cursor=${body1.meta.nextCursor}`);
    const body2 = (await page2.json()) as { data: { title: string }[]; meta: { hasMore: boolean } };
    expect(body2.data).toHaveLength(1);
    expect(body2.meta.hasMore).toBe(false);

    const allTitles = [...body1.data, ...body2.data].map((r) => r.title).sort();
    expect(allTitles).toEqual(['b1', 'b2', 'b3']);
  });

  it('?include=<relation> expands as a sibling key without dropping the FK scalar (Q5)', async () => {
    const authorId = await createAuthor('Included Author');
    await app.request('/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorId, title: 'Z', price: '3.00' }) });

    const res = await app.request('/books?include=author');
    const body = (await res.json()) as { data: { authorId: string; author: { name: string } }[] };
    expect(body.data[0]!.authorId).toBe(authorId);
    expect(body.data[0]!.author).toMatchObject({ name: 'Included Author' });
  });

  it('multi-hop include is rejected, not silently truncated (Q20)', async () => {
    const res = await app.request('/books?include=author.publisher');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_INCLUDE');
  });

  it('PATCH partially updates and DELETE soft-deletes (excluded from list/get, visible via includeDeleted)', async () => {
    const authorId = await createAuthor('Del Author');
    const createRes = await app.request('/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorId, title: 'ToDelete', price: '5.00' }) });
    const created = ((await createRes.json()) as { data: { id: string } }).data;

    const patchRes = await app.request(`/books/${created.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ price: '6.00' }) });
    expect(((await patchRes.json()) as { data: { price: string; title: string } }).data).toMatchObject({ price: '6.00', title: 'ToDelete' });

    const delRes = await app.request(`/books/${created.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    expect(((await delRes.json()) as { data: { deletedAt: string | null } }).data.deletedAt).not.toBeNull();

    const getRes = await app.request(`/books/${created.id}`);
    expect(getRes.status).toBe(404);

    const getDeletedRes = await app.request(`/books/${created.id}?includeDeleted=true`);
    expect(getDeletedRes.status).toBe(200);
  });

  it('POST with a malformed body -> 400 VALIDATION_ERROR, not a 500', async () => {
    const res = await app.request('/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });
});
