import { describe, expect, it } from 'bun:test';
import { renderPage, pagePathOf } from '../src/website/render.js';
import { assertSlugNotReserved } from '../src/website/pipeline.js';
import type { OperationContext } from '../src/core/pipeline.js';

function ctx(input: Record<string, unknown>): OperationContext {
  return { operation: 'create', input, doc: null, model: {} as never, db: {} as never };
}

describe('pagePathOf (src/website/render.ts)', () => {
  it('is "/" for the home page, "/slug" otherwise', () => {
    expect(pagePathOf({ isHome: true, slug: 'ignored' })).toBe('/');
    expect(pagePathOf({ isHome: false, slug: 'about' })).toBe('/about');
  });
});

describe('renderPage (src/website/render.ts)', () => {
  const page = { title: 'About', slug: 'about', isHome: false, metaDescription: '' };
  const blocks: Record<string, unknown>[] = [];

  it('renders with no Domain Settings at all — every optional tag omitted', () => {
    const html = renderPage(page, blocks);
    expect(html).toContain('<title>About</title>');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('rel="icon"');
    expect(html).not.toContain('name="robots"');
  });

  it('suffixes the page title with the site title, skipped when they already match', () => {
    expect(renderPage(page, blocks, { title: 'Acme' })).toContain('<title>About — Acme</title>');
    expect(renderPage({ ...page, title: 'Acme' }, blocks, { title: 'Acme' })).toContain('<title>Acme</title>');
  });

  it('falls back to the sitewide description only when the page has none of its own', () => {
    expect(renderPage(page, blocks, { description: 'Site fallback' })).toContain(
      '<meta name="description" content="Site fallback">',
    );
    expect(renderPage({ ...page, metaDescription: 'Own description' }, blocks, { description: 'Site fallback' })).toContain(
      '<meta name="description" content="Own description">',
    );
  });

  it('emits a canonical link and an absolute og:url only when siteUrl is set, trimming a trailing slash', () => {
    const withTrailingSlash = renderPage(page, blocks, { siteUrl: 'https://acme.com/' });
    expect(withTrailingSlash).toContain('<link rel="canonical" href="https://acme.com/about">');
    expect(withTrailingSlash).toContain('<meta property="og:url" content="https://acme.com/about">');
    expect(renderPage(page, blocks, {})).not.toContain('rel="canonical"');
  });

  it('emits og:image/twitter:image (large-image card) only with both siteUrl and ogImage set; otherwise a plain summary card, still emitting the other OG tags', () => {
    const full = renderPage(page, blocks, {
      siteUrl: 'https://acme.com',
      ogImage: { key: 'domain-settings/website/ogImage/tok1', filename: 'og.png', mimeType: 'image/png', size: 1 },
    });
    expect(full).toContain('<meta property="og:image" content="https://acme.com/_site-assets/website/ogImage/tok1">');
    expect(full).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(full).toContain('<meta name="twitter:image" content="https://acme.com/_site-assets/website/ogImage/tok1">');

    const noSiteUrl = renderPage(page, blocks, {
      ogImage: { key: 'domain-settings/website/ogImage/tok1', filename: 'og.png', mimeType: 'image/png', size: 1 },
    });
    expect(noSiteUrl).not.toContain('og:image');
    expect(noSiteUrl).toContain('<meta name="twitter:card" content="summary">');
    expect(noSiteUrl).toContain('<meta property="og:title" content="About">');
  });

  it('emits a relative favicon link regardless of siteUrl (browsers resolve it against the page)', () => {
    const html = renderPage(page, blocks, {
      favicon: { key: 'domain-settings/website/favicon/abc', filename: 'f.png', mimeType: 'image/png', size: 1 },
    });
    expect(html).toContain('<link rel="icon" href="/_site-assets/website/favicon/abc">');
  });

  it('noindex adds a robots meta tag to every page', () => {
    expect(renderPage(page, blocks, { noindex: true })).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(renderPage(page, blocks, { noindex: false })).not.toContain('name="robots"');
  });

  it('appends globalCss and headHtml raw and unescaped, inside <head>', () => {
    const html = renderPage(page, blocks, {
      globalCss: 'body { color: red; }',
      headHtml: '<script>window.ga=1</script>',
    });
    expect(html).toContain('<style>body { color: red; }</style>');
    expect(html).toContain('<script>window.ga=1</script>');
    expect(html.indexOf('<script>window.ga=1</script>')).toBeLessThan(html.indexOf('</head>'));
  });

  it('still escapes the <title> and description even with a site title/description set', () => {
    const html = renderPage({ ...page, title: '<b>About</b>' }, blocks, { title: 'A & B' });
    expect(html).toContain('<title>&lt;b&gt;About&lt;/b&gt; — A &amp; B</title>');
  });
});

describe('assertSlugNotReserved (src/website/pipeline.ts)', () => {
  const call = (slug: string) => assertSlugNotReserved(ctx({ slug }));

  it('rejects api, robots.txt, sitemap.xml, and _site-assets as the first path segment', () => {
    for (const slug of ['api', 'api/foo', 'robots.txt', 'sitemap.xml', '_site-assets', '_site-assets/x']) {
      expect(() => call(slug)).toThrow();
    }
  });

  it('allows an ordinary slug, and a slug that merely contains a reserved word past the first segment', () => {
    expect(() => call('about')).not.toThrow();
    expect(() => call('docs/api-reference')).not.toThrow();
  });
});
