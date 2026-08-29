import { defineDomain } from '../core/domain.js';
import { field } from '../core/field.js';

/** Site-wide settings (ADR 0002), consumed at render time by `render.ts`'s `renderPage` (plus
 * `router.ts`'s `robots.txt`/`sitemap.xml` routes for `siteUrl`/`noindex`):
 *
 * - `title` suffixes every page's `<title>` (e.g. "About — Acme"), skipped when it equals the
 *   page's own title or is unset.
 * - `description` is the `<meta name="description">` fallback for a page that doesn't set its own
 *   `metaDescription`.
 * - `siteUrl` is the site's real public origin (e.g. `https://acme.com`, no trailing slash) —
 *   needed to turn a page's own relative path into the *absolute* URL `<link rel="canonical">`,
 *   `og:url`, `og:image`, and `sitemap.xml` all require. Console-editable (not
 *   `FrameworkConfig.siteUrl`, ADR 0002) since a staging→prod cutover shouldn't need a redeploy.
 *   Left unset, canonical/OG tags are simply omitted and `sitemap.xml` 404s rather than emit
 *   spec-invalid relative `<loc>`s.
 * - `noindex` sitewide-discourages indexing — a `<meta name="robots" content="noindex, nofollow">`
 *   on every page *and* a blanket `Disallow: /` in `robots.txt`, belt-and-suspenders (a crawler
 *   that never renders the page still sees `robots.txt`; one that does still sees the meta tag).
 *   For staging/pre-launch sites that would otherwise leak into search results.
 * - `favicon`/`ogImage` are `field.file({ public: true })` (`core/field.ts`): the site favicon and
 *   the default social share image, each served unauthenticated from a fixed URL
 *   (`router/site-assets.ts`) since a browser tab and a social-media crawler alike fetch them with
 *   no session. Two separate fields, not one shared image — a favicon (small, square) and a good
 *   OG image (1200×630 landscape) want different aspect ratios, and `ogImage` is never inferred
 *   from `favicon` (the tag is just omitted if unset).
 * - `headHtml` is raw markup appended into `<head>` on every page — analytics snippets (GA, GTM,
 *   ...), a verification meta tag, anything. Deliberately generic rather than vendor-specific
 *   fields: same trust model as `globalCss` below (admin-authored, unescaped), and not locked to
 *   whichever analytics vendor the framework happened to special-case.
 * - `globalCss` is raw CSS appended after the built-in base styles on every published page —
 *   deliberately unescaped, same trust model as a `Block`'s `html` type (`models/block.model.ts`):
 *   admin-authored, rendered as-is. Uses `field.custom('code', ...)` so the console renders it
 *   with the CodeJar-backed editor (`console/client/CodeEditor.tsx`) instead of a plain textarea.
 *
 * No `consoleMenu` entry: the `Page` model already gets its own "Pages" sidebar link from being in
 * this Domain (the normal model-list screen, with `page.form.tsx` in place of the generated form —
 * see its own doc comment), and that form's "Edit content →" button is how the Page Builder screen
 * (`console/client/PageBuilderPage.tsx`) actually gets reached — a second sidebar link to the same
 * place would be redundant. */
export const WebsiteDomain = defineDomain('website', {
  settings: {
    title: field.string({
      maxLength: 255,
      displayText: 'Site title',
      description: 'Appended to every page title, e.g. "Page — Site".',
    }),
    description: field.text({
      displayText: 'Site description',
      description: 'Fallback <meta name="description"> for a page that doesn’t set its own.',
    }),
    siteUrl: field.string({
      maxLength: 255,
      displayText: 'Site URL',
      description: 'The site’s real public origin, e.g. "https://acme.com" (no trailing slash). Needed for canonical/OG tags and sitemap.xml.',
    }),
    noindex: field.boolean({
      default: false,
      displayText: 'Discourage search engines',
      description: 'Sitewide noindex — for a staging or pre-launch site. Adds a robots meta tag to every page and disallows everything in robots.txt.',
    }),
    favicon: field.file({
      public: true,
      preview: 'image',
      accept: 'image/png,image/x-icon,image/svg+xml',
      maxSize: 2 * 1024 * 1024,
      displayText: 'Favicon',
    }),
    ogImage: field.file({
      public: true,
      preview: 'image',
      accept: 'image/png,image/jpeg',
      maxSize: 2 * 1024 * 1024,
      displayText: 'Social share image',
      description: 'Default og:image/twitter:image for a page that doesn’t set its own — ideally 1200×630.',
    }),
    headHtml: field.custom(
      'code',
      field.text({
        displayText: 'Head HTML',
        description: 'Raw markup appended into <head> on every page — analytics snippets, verification tags, etc.',
      }),
    ),
    globalCss: field.custom(
      'code',
      field.text({
        displayText: 'Global CSS',
        description: 'Raw CSS injected into every published page, after the built-in base styles.',
      }),
    ),
  },
});
