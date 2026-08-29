import { defineModel, field, pipe, validate, persist, PipelineError, type PipelineFn } from '../../core/index.js';
import { presetFields } from '../../auth/pipeline.js';
import { assertSlugNotReserved, assertSingleHomePage } from '../pipeline.js';

/** `status`/`publishedAt` are only ever written by the `publish`/`unpublish` operations below —
 * never by a plain `update` — so there's exactly one path to change publish state, and exactly
 * one permission pair that grants it (`pages:publish`/`pages:unpublish`, not `pages:update` +
 * field grants on `status`/`publishedAt`), mirroring `workspace.model.ts`'s `locked`/
 * `forbidLockedInUpdate`. Must run before `validate` so either key in the request body is
 * rejected outright rather than silently accepted or dropped. */
export const forbidPublishStateInUpdate: PipelineFn = (ctx) => {
  const fields: Record<string, string> = {};
  if ('status' in ctx.input) fields.status = "can't be set via update — use the 'publish'/'unpublish' operation instead";
  if ('publishedAt' in ctx.input) fields.publishedAt = "can't be set via update — use the 'publish'/'unpublish' operation instead";
  if (Object.keys(fields).length > 0) {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields });
  }
  return ctx;
};

/** `presetFields` is called fresh on every invocation (not hoisted to a module-level constant)
 * so `publishedAt: new Date()` is the moment the operation actually runs, not the moment the
 * model was defined. */
export const publishPage: PipelineFn = (ctx) => presetFields({ status: 'published', publishedAt: new Date() })(ctx);
export const unpublishPage: PipelineFn = (ctx) => presetFields({ status: 'draft', publishedAt: null })(ctx);

/**
 * One page of the site the `website` built-in domain serves (see `src/website/router.ts`) —
 * ordered `Block` rows (`block.model.ts`) attached through the `blocks` `referenceToMany` below
 * are its content. Authored through the console's Page Builder screen
 * (`console/client/PageBuilderPage.tsx`), not the generic per-model form (see `page.form.tsx`,
 * which replaces it — the generic form's auto-derived `blocks` multi-select would let someone
 * "attach" blocks that were never built for this page).
 *
 * At most one `Page` may have `isHome: true` (enforced by `assertSingleHomePage`, which
 * atomically clears any previous holder) — that's the page `GET /` serves. Every other page is
 * served at its own `slug`. `assertSlugNotReserved` rejects a `slug` that would collide with the
 * framework's own `/api` router; a collision with the console's mount point can only be checked
 * at request time (the console's `consolePath` isn't known when this model is defined) — see
 * `router.ts`'s own doc comment for how mount order handles that instead.
 */
export const Page = defineModel('pages', {
  fields: {
    slug: field.string({ required: true, unique: true, indexed: true, maxLength: 255 }),
    title: field.string({ required: true, maxLength: 255 }),
    metaDescription: field.string({ required: false, maxLength: 300, displayText: 'Meta description' }),
    status: field.enum(['draft', 'published'] as const, { default: 'draft', indexed: true }),
    isHome: field.boolean({ default: false, displayText: 'Home page' }),
    publishedAt: field.datetime({ required: false, displayText: 'Published at' }),
    blocks: field.referenceToMany('blocks', { inverseColumn: 'pageId', displayText: 'Blocks' }),
  },
  operations: {
    create: pipe(assertSlugNotReserved, assertSingleHomePage, validate, persist),
    update: pipe(assertSlugNotReserved, forbidPublishStateInUpdate, assertSingleHomePage, validate, persist),
    publish: {
      pipeline: publishPage,
      description: 'Publishes the page, making it reachable at its slug.',
      console: { label: 'Publish', visibleWhen: { field: 'status', equals: 'draft' } },
    },
    unpublish: {
      pipeline: unpublishPage,
      description: 'Unpublishes the page — it stops being reachable at its slug.',
      console: { label: 'Unpublish', visibleWhen: { field: 'status', equals: 'published' } },
    },
  },
  console: { label: 'Pages', displayField: 'title' },
});
