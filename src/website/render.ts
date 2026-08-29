/**
 * Renders a published `Page` (`models/page.model.ts`) and its ordered `Block` rows
 * (`models/block.model.ts`) to a standalone HTML document — the public render path `router.ts`
 * calls. Every block type except `html` builds markup from data through this file's own escaping
 * helpers, so nothing here ever interpolates unescaped block content into the page; `html`
 * blocks are the deliberate, permission-gated exception (see `block.model.ts`'s doc comment).
 */

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
 * returned by `core/persistence.ts`'s `listRowsByField`), not `ModelDefinition`-typed. */
export function renderPage(page: Record<string, unknown>, blocks: Record<string, unknown>[]): string {
  const title = escapeHtml(asString(page.title, 'Untitled'));
  const metaDescription = asString(page.metaDescription);
  const body = blocks.map(renderBlock).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${metaDescription ? `<meta name="description" content="${escapeAttr(metaDescription)}">\n` : ''}<style>${DEFAULT_STYLES}</style>
</head>
<body>
<main class="rp-page">
${body}
</main>
</body>
</html>
`;
}
