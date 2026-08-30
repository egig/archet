import { defineModel, field, pipe, validate, persist, PipelineError, type PipelineFn } from '../../core/index.js';
import { presetFields } from '../../auth/pipeline.js';
import { assertSlugNotReserved, sanitizeBody } from '../pipeline.js';

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
 * One page of the public site. Ratchet no longer renders pages itself — the `website` domain is
 * pure content management, and the site is served by the consuming app's own
 * `@egig/ratchet/web` routes (`ratchet init` scaffolds `routes/$.tsx`, which looks a `Page` up by
 * slug and renders `body`). `body` is a rich-text HTML string authored with the console's Quill
 * editor (`field.custom('richtext', …)`, rendered by `console/client/RichTextEditor.tsx`) and
 * sanitized server-side on every write by `sanitizeBody` (`../pipeline.ts`) — an allowlist pass so
 * a page body can never carry script/`on*`/`javascript:` into a visitor's browser.
 *
 * `navLocation`/`navOrder` drive the scaffolded `root.tsx`'s header/footer navigation: a page with
 * `navLocation: 'header'` shows in the top nav, `'footer'` in the footer, `'none'` nowhere,
 * ordered by `navOrder` ascending. `assertSlugNotReserved` rejects a `slug` that would be shadowed
 * by a scaffolded route file (`contact`) or a framework asset path.
 */
export const Page = defineModel('pages', {
  fields: {
    slug: field.string({ required: true, unique: true, indexed: true, maxLength: 255 }),
    title: field.string({ required: true, maxLength: 255 }),
    metaDescription: field.string({ required: false, maxLength: 300, displayText: 'Meta description' }),
    body: field.custom('richtext', field.text({ required: true, displayText: 'Content' })),
    status: field.enum(['draft', 'published'] as const, { default: 'draft', indexed: true }),
    navLocation: field.enum(['none', 'header', 'footer'] as const, {
      default: 'none',
      displayText: 'Navigation',
      description: 'Where this page links from — the top nav, the footer, or nowhere.',
    }),
    navOrder: field.integer({ default: 0, displayText: 'Navigation order' }),
    publishedAt: field.datetime({ required: false, displayText: 'Published at' }),
  },
  operations: {
    create: pipe(assertSlugNotReserved, sanitizeBody, validate, persist),
    update: pipe(assertSlugNotReserved, forbidPublishStateInUpdate, sanitizeBody, validate, persist),
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
