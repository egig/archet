import { PipelineError, type PipelineFn } from '../core/pipeline.js';
import { listRowsByField, updateRow } from '../core/persistence.js';
import { Page } from './models/page.model.js';

/** Path segments always reserved, on every deployment, unconditionally: `api` (`/api/*` is
 * hardcoded at every mount site) plus the three well-known files `router.ts` registers ahead of
 * its own `/:slug` catch-all (`robots.txt`, `sitemap.xml`) and ahead of that same catch-all in
 * `serve.ts`'s mount order (`_site-assets`, `router/site-assets.ts`) — a `Page` at any of these
 * slugs would silently never be reachable, always losing to the route registered first. A slug
 * colliding with the console's own mount point (`consolePath`, which *is* configurable) can't be
 * checked here — that value doesn't exist yet when this model is defined — so it's handled
 * instead by mount order at the router layer (see `router.ts`'s doc comment). */
const RESERVED_FIRST_SEGMENTS = new Set(['api', 'robots.txt', 'sitemap.xml', '_site-assets']);

export const assertSlugNotReserved: PipelineFn = (ctx) => {
  const slug = ctx.input.slug;
  if (typeof slug !== 'string') return ctx;
  const firstSegment = slug.split('/')[0]?.toLowerCase();
  if (firstSegment && RESERVED_FIRST_SEGMENTS.has(firstSegment)) {
    throw new PipelineError({
      code: 'VALIDATION_ERROR',
      status: 400,
      fields: { slug: `can't start with '${firstSegment}' — that path is reserved by the framework` },
    });
  }
  return ctx;
};

/** At most one `Page` may hold `isHome: true` — the page `GET /` serves (see `router.ts`).
 * Setting it on one page atomically clears it on whichever page previously held it, rather than
 * rejecting the write, so promoting a new home page is always a single-step action in the
 * console. Runs pre-boundary (before `persist`), so the clear and the write it's part of commit
 * in the same transaction. No-op unless `isHome: true` is actually in this write's input. */
export const assertSingleHomePage: PipelineFn = async (ctx) => {
  if (ctx.input.isHome !== true) return ctx;
  const currentHome = await listRowsByField(ctx.db, Page, 'isHome', true);
  for (const row of currentHome) {
    if (row.id !== ctx.id) {
      await updateRow(ctx.db, Page, row.id as string, { isHome: false });
    }
  }
  return ctx;
};
