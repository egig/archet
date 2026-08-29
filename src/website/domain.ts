import { defineDomain } from '../core/domain.js';
import { field } from '../core/field.js';

/** Site-wide settings (ADR 0002), consumed at render time by `render.ts`'s `renderPage`:
 * `title` suffixes every page's `<title>` (e.g. "About — Acme"), skipped when it equals the
 * page's own title or is unset; `description` is the `<meta name="description">` fallback for a
 * page that doesn't set its own `metaDescription`; `globalCss` is raw CSS appended after the built-in base styles
 * on every published page — deliberately unescaped, same trust model as a `Block`'s `html` type
 * (`models/block.model.ts`): admin-authored, rendered as-is. `globalCss` uses `field.custom('code',
 * ...)` so the console renders it with the CodeJar-backed editor (`console/client/CodeEditor.tsx`)
 * instead of a plain textarea.
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
    globalCss: field.custom(
      'code',
      field.text({
        displayText: 'Global CSS',
        description: 'Raw CSS injected into every published page, after the built-in base styles.',
      }),
    ),
  },
});
