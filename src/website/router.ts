import { Hono } from 'hono';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { listRowsByField } from '../core/persistence.js';
import { Page, Block } from './models/index.js';
import { renderPage } from './render.js';

type AnyDb = PgDatabase<any, any, any>;

async function findPublishedPageBySlug(db: AnyDb, slug: string): Promise<Record<string, unknown> | null> {
  const rows = await listRowsByField(db, Page, 'slug', slug);
  const page = rows[0];
  return page && page.status === 'published' ? page : null;
}

async function findPublishedHomePage(db: AnyDb): Promise<Record<string, unknown> | null> {
  const rows = await listRowsByField(db, Page, 'isHome', true);
  return rows.find((row) => row.status === 'published') ?? null;
}

async function renderPageResponse(db: AnyDb, page: Record<string, unknown>): Promise<Response> {
  const blocks = await listRowsByField(db, Block, 'pageId', page.id as string);
  blocks.sort((a, b) => ((a.order as number) ?? 0) - ((b.order as number) ?? 0));
  return new Response(renderPage(page, blocks), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/**
 * Public, unauthenticated router serving published `Page`s as plain HTML by slug — the
 * `website` built-in domain's read path. The write/admin path is the generic `/api/pages` +
 * `/api/blocks` REST routes (unchanged from any other model) plus the console's Page Builder
 * screen; this router only ever reads.
 *
 * Must be mounted LAST in the app's Hono composition — after `/api/*` and the console router
 * (see `cli/commands/serve.ts`). Its `/:slug` route is a catch-all that would otherwise swallow
 * every other mount; mounting it last also resolves the one reserved-path check that can't happen
 * at write time (`pipeline.ts`'s `assertSlugNotReserved` only knows to reject `api`, since the
 * console's `consolePath` is a runtime config value, not something a model file can see): a page
 * slug that happens to equal the console's mount point still loses to the console, because
 * whichever router is mounted first claims the path and this one only ever receives what nothing
 * else claimed.
 */
export function createWebsiteRouter(db: AnyDb): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const home = await findPublishedHomePage(db);
    if (!home) return c.notFound();
    return renderPageResponse(db, home);
  });

  app.get('/:slug', async (c) => {
    const page = await findPublishedPageBySlug(db, c.req.param('slug'));
    if (!page) return c.notFound();
    return renderPageResponse(db, page);
  });

  return app;
}
