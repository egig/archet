import { defineModel, field, pipe, validate, persist, PipelineError, type PipelineFn } from '@egig/ratchet/core';
import sanitizeHtml from 'sanitize-html';

// First path segments a page slug can't take — each is already answered by something else (a
// route file, a framework asset prefix, the REST mount) before routes/$.tsx could match it.
const RESERVED_FIRST_SEGMENTS = new Set(['api', 'contact', '_ratchet', '_site-assets']);

const assertSlugNotReserved: PipelineFn = (ctx) => {
  const slug = ctx.input.slug;
  if (typeof slug !== 'string') return ctx;
  const first = slug.replace(/^\/+/, '').split('/')[0]?.toLowerCase();
  if (first && RESERVED_FIRST_SEGMENTS.has(first)) {
    throw new PipelineError({
      code: 'VALIDATION_ERROR',
      status: 400,
      fields: { slug: `can't start with '${first}' — that path is reserved` },
    });
  }
  return ctx;
};

// The tags/attributes a page body may contain. Everything else survives as text but loses its
// tag; `a[href]` is restricted to http/https/mailto so a body can never carry `javascript:`.
const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote', 'pre', 'code', 'span'],
  allowedAttributes: { a: ['href', 'name', 'target', 'rel'], span: ['class'], code: ['class'], pre: ['class'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
};

// Sanitize `body` on every write so routes/$.tsx can render it with dangerouslySetInnerHTML
// without a second pass. No-op unless `body` is a string in this write's input.
const sanitizeBody: PipelineFn = (ctx) => {
  if (typeof ctx.input.body !== 'string') return ctx;
  return { ...ctx, input: { ...ctx.input, body: sanitizeHtml(ctx.input.body, ALLOWED) } };
};

/**
 * One page of the public site. Edited in the console, rendered by routes/$.tsx (by slug) and
 * linked from routes/root.tsx (header/footer nav, from `navLocation`/`navOrder`). `status` gates
 * whether a page is live — routes filter `where status = 'published'`.
 */
export const Page = defineModel('pages', {
  fields: {
    slug: field.string({ required: true, unique: true, indexed: true, maxLength: 255 }),
    title: field.string({ required: true, maxLength: 255 }),
    metaDescription: field.string({ required: false, maxLength: 300, displayText: 'Meta description' }),
    body: field.text({ required: true, displayText: 'Content' }),
    status: field.enum(['draft', 'published'] as const, { default: 'draft', indexed: true }),
    navLocation: field.enum(['none', 'header', 'footer'] as const, {
      default: 'none',
      displayText: 'Navigation',
      description: 'Where this page links from — the top nav, the footer, or nowhere.',
    }),
    navOrder: field.integer({ default: 0, displayText: 'Navigation order' }),
  },
  operations: {
    create: pipe(assertSlugNotReserved, sanitizeBody, validate, persist),
    update: pipe(assertSlugNotReserved, sanitizeBody, validate, persist),
  },
  console: { label: 'Pages', displayField: 'title' },
});
