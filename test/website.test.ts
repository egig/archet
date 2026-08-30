import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { OperationContext } from '../src/core/pipeline.js';
import { assertSlugNotReserved, sanitizeBody } from '../src/website/pipeline.js';
import { Page } from '../src/website/models/index.js';

function ctx(input: Record<string, unknown>): OperationContext {
  return { operation: 'create', input, doc: null, model: Page, db: {} as never };
}

describe('sanitizeBody (src/website/pipeline.ts)', () => {
  it('strips <script>, on* handlers, and javascript: hrefs; keeps allowlisted formatting', async () => {
    const dirty =
      '<h2>Hi</h2><p onclick="steal()">text <strong>bold</strong></p>' +
      '<script>evil()</script><a href="javascript:alert(1)">x</a>' +
      '<a href="https://example.com">ok</a><img src="x" onerror="y">';
    const clean = (await sanitizeBody(ctx({ body: dirty }))).input.body as string;

    expect(clean).toContain('<h2>Hi</h2>');
    expect(clean).toContain('<strong>bold</strong>');
    expect(clean).toContain('href="https://example.com"');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('<img');
  });

  it('adds rel="noopener noreferrer" to external links', async () => {
    const clean = (await sanitizeBody(ctx({ body: '<a href="https://x.com">x</a>' }))).input.body as string;
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('is a no-op when there is no string body in the input', async () => {
    const input = { title: 'x' };
    expect((await sanitizeBody(ctx(input))).input).toBe(input);
  });
});

describe('assertSlugNotReserved (src/website/pipeline.ts)', () => {
  it('rejects a slug whose first segment collides with a reserved path', () => {
    for (const slug of ['contact', 'api', 'api/x', '_ratchet', '/contact']) {
      expect(() => assertSlugNotReserved(ctx({ slug }))).toThrow();
    }
  });

  it('allows an ordinary slug', () => {
    expect(() => assertSlugNotReserved(ctx({ slug: 'about' }))).not.toThrow();
    expect(() => assertSlugNotReserved(ctx({ slug: 'contact-us' }))).not.toThrow();
  });
});

const connectionString = process.env.DATABASE_URL;
const describeIfDb = connectionString ? describe : describe.skip;

describeIfDb('Page write pipeline (against a live Postgres)', () => {
  let client: postgres.Sql;
  let db: PgDatabase<any, any, any>;

  beforeAll(async () => {
    client = postgres(connectionString!);
    db = drizzle(client) as unknown as PgDatabase<any, any, any>;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pages (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz, created_by_id uuid,
        slug varchar NOT NULL, title varchar NOT NULL, meta_description varchar, body text,
        status varchar NOT NULL DEFAULT 'draft', nav_location varchar NOT NULL DEFAULT 'none',
        nav_order integer NOT NULL DEFAULT 0, published_at timestamptz
      )`);
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE pages`);
  });

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS pages`);
    await client.end();
  });

  it('sanitizes body before it is persisted', async () => {
    await Page.operations.create({
      operation: 'create',
      input: { slug: 'x', title: 'X', body: '<p>ok</p><script>bad()</script>' },
      doc: null,
      model: Page,
      db,
    });
    const rows = (await db.execute(sql`SELECT body FROM pages WHERE slug = 'x'`)) as unknown as { body: string }[];
    expect(rows[0]!.body).toBe('<p>ok</p>');
  });

  it('rejects a create with a reserved slug', async () => {
    await expect(
      Page.operations.create({
        operation: 'create',
        input: { slug: 'contact', title: 'X', body: '<p>x</p>' },
        doc: null,
        model: Page,
        db,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });
});
