import { defineDomain } from '../core/domain.js';
import { field } from '../core/field.js';

/** Site-wide settings (ADR 0002) the consuming app's `@egig/ratchet/web` routes read at render
 * time — `ratchet init`'s scaffolded `routes/root.tsx` reads them through
 * `getWebContext(context).settings.get('website')`:
 *
 * - `title` is the site name, suffixed onto each page's `<title>` ("About — Acme").
 * - `description` is the `<meta name="description">` fallback for a page that sets none of its own.
 * - `siteUrl` is the site's real public origin (e.g. `https://acme.com`, no trailing slash) —
 *   used to build absolute `<link rel="canonical">` / `og:url` URLs. Console-editable (not
 *   `FrameworkConfig`, ADR 0002) so a staging→prod cutover needs no redeploy.
 * - `noindex` sitewide-discourages indexing — the scaffold emits `<meta name="robots"
 *   content="noindex, nofollow">` on every page when it's set. For staging / pre-launch sites.
 * - `favicon`/`ogImage` are `field.file({ public: true })` (`core/field.ts`): served
 *   unauthenticated from a fixed `/_site-assets/*` URL (`router/site-assets.ts`), since a browser
 *   tab and a social-media crawler fetch them with no session. Kept as two fields, not one — a
 *   favicon (small, square) and an OG image (1200×630) want different art.
 *
 * Deliberately no `headHtml`/`globalCss` raw-markup escape hatches any more: the site shell is
 * now the consumer's own `routes/root.tsx` + `public/theme.css`, both editable source. */
export const WebsiteDomain = defineDomain('website', {
  settings: {
    title: field.string({
      maxLength: 255,
      displayText: 'Site title',
      description: 'The site name — appended to every page title, e.g. "Page — Site".',
    }),
    description: field.text({
      displayText: 'Site description',
      description: 'Fallback <meta name="description"> for a page that doesn’t set its own.',
    }),
    siteUrl: field.string({
      maxLength: 255,
      displayText: 'Site URL',
      description: 'The site’s real public origin, e.g. "https://acme.com" (no trailing slash). Used for canonical and Open Graph URLs.',
    }),
    noindex: field.boolean({
      default: false,
      displayText: 'Discourage search engines',
      description: 'Sitewide noindex — for a staging or pre-launch site. Adds a robots meta tag to every page.',
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
  },
});
