/**
 * Renders a published `Page` (`models/page.model.ts`) and its ordered `Block` rows
 * (`models/block.model.ts`) to a standalone HTML document — the public render path `router.ts`
 * calls. Every block type except `html` builds markup from data through this file's own escaping
 * helpers, so nothing here ever interpolates unescaped block content into the page; `html`
 * blocks are the deliberate, permission-gated exception (see `block.model.ts`'s doc comment).
 */
import { siteAssetUrl } from '../core/serialize.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

/** Only `http:`/`https:`/`mailto:` survive as a real `href`/`src` — anything else (most notably
 * `javascript:`) is neutered to `#`, since this runs over admin-authored content that may
 * eventually flow through a lower-trust role (see `block.model.ts`). A bare `/relative/path` (an
 * internal link to another page) has no scheme at all and is let through unchanged. */
function sanitizeUrl(value: string): string {
  const trimmed = value.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '#';
  return trimmed;
}

/** Inline Markdown subset — `**bold**`, `*italic*`, `` `code` ``, `[label](url)` — applied to
 * already-`escapeHtml`'d text, so every substitution below is inserting a fixed, safe tag around
 * text that can no longer contain a stray `<`/`>`/`&`. `url` inside a link still goes through
 * `sanitizeUrl` + `escapeAttr` on its own, since Markdown's `(url)` slot never passed through
 * `escapeHtml` at all (it's consumed here, not left in the surrounding text). */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => `<a href="${escapeAttr(sanitizeUrl(url))}">${label}</a>`);
}

/** Markdown paragraphs only — a blank line starts a new `<p>`, a single newline becomes `<br>`.
 * No lists/headings/block quotes; `text` blocks sit alongside a dedicated `heading` block type
 * for anything bigger than a paragraph (`block.model.ts`). */
function markdownToHtml(source: string): string {
  return source
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${renderInline(escapeHtml(paragraph)).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** The public path `router.ts` serves a page at — `/` for the home page (`isHome`), `/<slug>`
 * otherwise. Shared with `router.ts`'s `sitemap.xml` route so the two can never drift on what a
 * page's own URL looks like. */
export function pagePathOf(page: Record<string, unknown>): string {
  return page.isHome ? '/' : `/${asString(page.slug)}`;
}

/** `settings.favicon`/`settings.ogImage` (a `field.file({ public: true })` value, `{ key,
 * filename, mimeType, size }` — see `core/storage.ts`'s `StoredFile`) turned into the public,
 * unauthenticated URL `router/site-assets.ts` serves it at, or `undefined` if that setting was
 * never uploaded. */
function siteAssetUrlOf(settings: Record<string, unknown>, field: string): string | undefined {
  const value = settings[field];
  const key = value && typeof value === 'object' ? (value as { key?: unknown }).key : undefined;
  return typeof key === 'string' ? siteAssetUrl('website', field, key) : undefined;
}

/** `siteUrl` (Domain Settings) turns a path this file already knows to be safe (its own
 * `pagePathOf`/asset URLs, never raw user input) into an absolute URL — required for
 * `og:image`/`og:url`/canonical/sitemap `<loc>`, which the relevant specs and social-media
 * crawlers alike expect to be able to fetch directly, not resolve relative to the page. Returns
 * `undefined` (letting a caller omit the tag entirely) when `siteUrl` isn't set, rather than
 * emitting a relative URL those consumers wouldn't accept anyway. */
function absoluteUrl(siteUrl: string, path: string): string | undefined {
  return siteUrl ? `${siteUrl.replace(/\/+$/, '')}${path}` : undefined;
}

function renderBlock(block: Record<string, unknown>): string {
  const content = (block.content as Record<string, unknown> | null) ?? {};
  switch (block.type) {
    case 'heading':
      return `<h2>${escapeHtml(asString(content.text))}</h2>`;
    case 'text':
      return markdownToHtml(asString(content.text));
    case 'image': {
      const url = sanitizeUrl(asString(content.url));
      const alt = asString(content.alt);
      return url ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}">` : '';
    }
    case 'button': {
      const href = sanitizeUrl(asString(content.href, '#'));
      const label = asString(content.label, 'Learn more');
      return `<a class="rp-button" href="${escapeAttr(href)}">${escapeHtml(label)}</a>`;
    }
    case 'spacer':
      return '<div class="rp-spacer"></div>';
    case 'html':
      // Deliberately unescaped — see block.model.ts's doc comment.
      return asString(block.htmlContent);
    default:
      return '';
  }
}

const DEFAULT_STYLES = `
  :root { color-scheme: light; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; background: #fff; }
  .rp-page { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem; line-height: 1.6; }
  .rp-page > * + * { margin-top: 1.25rem; }
  h1, h2, h3 { line-height: 1.25; }
  img { max-width: 100%; height: auto; display: block; border-radius: 6px; }
  .rp-button { display: inline-block; padding: 0.6rem 1.25rem; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; }
  .rp-button:hover { background: #333; }
  .rp-spacer { height: 2rem; }
  a { color: #1a1a1a; }
  code { background: #f2f2f2; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
`;

/** Builds the full HTML document for one page — `page` and `blocks` are plain row objects (as
 * returned by `core/persistence.ts`'s `listRowsByField`), not `ModelDefinition`-typed. `settings`
 * is the `website` domain's Domain Settings (`getDomainSettings(db, WebsiteDomain)`, ADR 0002) —
 * defaults to `{}` so a caller with no settings row yet (or a test) still renders. */
export function renderPage(
  page: Record<string, unknown>,
  blocks: Record<string, unknown>[],
  settings: Record<string, unknown> = {},
): string {
  const siteUrl = asString(settings.siteUrl);
  const siteTitle = asString(settings.title);
  const pageTitle = asString(page.title, 'Untitled');
  const title = siteTitle && siteTitle !== pageTitle ? `${pageTitle} — ${siteTitle}` : pageTitle;
  const metaDescription = asString(page.metaDescription) || asString(settings.description);
  const globalCss = asString(settings.globalCss);
  const headHtml = asString(settings.headHtml);
  const body = blocks.map(renderBlock).join('\n');

  const canonicalUrl = absoluteUrl(siteUrl, pagePathOf(page));
  const faviconUrl = siteAssetUrlOf(settings, 'favicon');
  const ogImageUrl = siteAssetUrlOf(settings, 'ogImage');
  const absoluteOgImageUrl = ogImageUrl ? absoluteUrl(siteUrl, ogImageUrl) : undefined;

  // og:title/og:description/og:type don't need an absolute URL, so they're emitted regardless of
  // `siteUrl` — only og:url/og:image (and canonical, above) require one the spec/crawlers can
  // actually fetch, so those are skipped rather than emitted relative (see `absoluteUrl`).
  const ogTags = [
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:type" content="website">`,
    canonicalUrl ? `<meta property="og:url" content="${escapeAttr(canonicalUrl)}">` : '',
    metaDescription ? `<meta property="og:description" content="${escapeAttr(metaDescription)}">` : '',
    absoluteOgImageUrl ? `<meta property="og:image" content="${escapeAttr(absoluteOgImageUrl)}">` : '',
    `<meta name="twitter:card" content="${absoluteOgImageUrl ? 'summary_large_image' : 'summary'}">`,
    absoluteOgImageUrl ? `<meta name="twitter:image" content="${escapeAttr(absoluteOgImageUrl)}">` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${metaDescription ? `<meta name="description" content="${escapeAttr(metaDescription)}">\n` : ''}${settings.noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ''}${canonicalUrl ? `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">\n` : ''}${faviconUrl ? `<link rel="icon" href="${escapeAttr(faviconUrl)}">\n` : ''}${ogTags}
<style>${DEFAULT_STYLES}</style>
${globalCss ? `<style>${globalCss}</style>\n` : ''}${headHtml ? `${headHtml}\n` : ''}</head>
<body>
<main class="rp-page">
${body}
</main>
</body>
</html>
`;
}
