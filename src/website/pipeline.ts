import { PipelineError, type PipelineFn } from '../core/pipeline.js';
import { listRowsByField, updateRow } from '../core/persistence.js';
import { Page } from './models/page.model.js';

/** Rejects a `slug` whose first path segment is `api` — the one prefix that's always reserved,
 * on every deployment, unconditionally (`/api/*` is hardcoded at every mount site, never
 * configurable). A slug colliding with the console's own mount point (`consolePath`, which *is*
 * configurable) can't be checked here — that value doesn't exist yet when this model is defined —
 * so it's handled instead by mount order at the router layer (see `router.ts`'s doc comment). */
export const assertSlugNotReserved: PipelineFn = (ctx) => {
  const slug = ctx.input.slug;
  if (typeof slug !== 'string') return ctx;
  const firstSegment = slug.split('/')[0]?.toLowerCase();
  if (firstSegment === 'api') {
    throw new PipelineError({
      code: 'VALIDATION_ERROR',
      status: 400,
      fields: { slug: "can't start with 'api' — that path is reserved by the framework's own API router" },
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
