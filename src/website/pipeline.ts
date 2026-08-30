import sanitizeHtml from 'sanitize-html';
import { PipelineError, type PipelineFn } from '../core/pipeline.js';

/** First path segments a `Page.slug` can never take, because a request for that path is answered
 * by something else before it could ever reach the scaffolded `routes/$.tsx` page lookup:
 * `contact` is a scaffolded route file (`cli/commands/init.ts`), `_ratchet`/`_site-assets` are
 * fixed framework asset prefixes (`web/router.ts`, `router/site-assets.ts`), and `api` is the
 * REST mount. A page at any of these slugs would just silently never render. */
const RESERVED_FIRST_SEGMENTS = new Set(['api', 'contact', '_ratchet', '_site-assets']);

export const assertSlugNotReserved: PipelineFn = (ctx) => {
  const slug = ctx.input.slug;
  if (typeof slug !== 'string') return ctx;
  const firstSegment = slug.replace(/^\/+/, '').split('/')[0]?.toLowerCase();
  if (firstSegment && RESERVED_FIRST_SEGMENTS.has(firstSegment)) {
    throw new PipelineError({
      code: 'VALIDATION_ERROR',
      status: 400,
      fields: { slug: `can't start with '${firstSegment}' — that path is reserved` },
    });
  }
  return ctx;
};

/** The tags/attributes the console's Quill editor (`console/client/RichTextEditor.tsx`) can
 * produce with its configured toolbar. Anything outside this survives as text content but loses
 * its tag; `a[href]` is additionally restricted to `http`/`https`/`mailto` (and bare relative
 * paths) so a page body can never carry `javascript:` — the exact concern that used to make the
 * old `html` block a separately-permissioned field. */
const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote', 'pre', 'code', 'span'],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    span: ['class'],
    code: ['class'],
    pre: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.href && /^https?:/i.test(attribs.href) ? { ...attribs, rel: 'noopener noreferrer' } : attribs,
    }),
  },
};

/** Sanitizes `Page.body` on every write — a pre-`validate` pipeline step so the stored HTML is
 * always the cleaned form, and the public site can render it with `dangerouslySetInnerHTML`
 * without a second sanitize pass. No-op unless `body` is a string in this write's input. */
export const sanitizeBody: PipelineFn = (ctx) => {
  if (typeof ctx.input.body !== 'string') return ctx;
  return { ...ctx, input: { ...ctx.input, body: sanitizeHtml(ctx.input.body, ALLOWED) } };
};
