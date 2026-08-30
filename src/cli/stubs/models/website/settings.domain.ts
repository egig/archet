import { defineDomain, field } from '@egig/ratchet/core';

/**
 * Site-wide settings, console-editable (Settings → Website) and read by the routes/ files through
 * `getWebContext(context).settings.get('website')`:
 *
 * - `title` is the site name, suffixed onto each page's `<title>`.
 * - `description` is the `<meta name="description">` fallback for a page that sets none.
 * - `siteUrl` is the real public origin (e.g. "https://acme.com", no trailing slash) — used to
 *   build absolute canonical / og:url URLs.
 * - `noindex` adds a `robots` noindex meta tag to every page — for a staging / pre-launch site.
 * - `favicon`/`ogImage` are `field.file({ public: true })`: served unauthenticated from a fixed
 *   `/_site-assets/*` URL, since a browser tab and a social crawler fetch them with no session.
 */
export const WebsiteSettings = defineDomain('website', {
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
