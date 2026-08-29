import { defineDomain } from '../core/domain.js';

/** No Domain Settings — `Page.title`/`metaDescription` already cover per-page needs, and a
 * site-wide settings panel (default title, favicon, ...) can be added later (`ADR 0002`) without
 * a schema change. No `consoleMenu` entry either: the `Page` model already gets its own "Pages"
 * sidebar link from being in this Domain (the normal model-list screen, with `page.form.tsx` in
 * place of the generated form — see its own doc comment), and that form's "Edit content →" button
 * is how the Page Builder screen (`console/client/PageBuilderPage.tsx`) actually gets reached — a
 * second sidebar link to the same place would be redundant. */
export const WebsiteDomain = defineDomain('website', {});
