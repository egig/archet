import { defineModel, field } from '../../core/index.js';

/** The block types the Page Builder screen (`console/client/PageBuilderPage.tsx`) and the public
 * renderer (`render.ts`) both know how to handle — see `block.model.ts`'s own doc comment for
 * each one's `content` shape. Exported so both stay in lockstep with the model. */
export const BLOCK_TYPES = ['heading', 'text', 'image', 'button', 'html', 'spacer'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * One piece of content within a `Page` (`page.model.ts`), in the order `order` gives it. The
 * inverse of `Page.blocks` (a `referenceToMany`) — `pageId` isn't declared here, it's injected
 * automatically onto this model (`core/reference-to-many.ts`).
 *
 * `content`'s shape depends on `type`, none of it enforced by a schema (kept as a plain JSON
 * object — the Page Builder screen is the only writer, and it only ever builds the shape its own
 * per-type editor collects):
 *   - `heading`: `{ text }`
 *   - `text`: `{ text }` — a small Markdown subset (paragraphs, `**bold**`, `*italic*`,
 *     `[label](url)`, `` `code` ``), rendered to sanitized HTML by `render.ts`.
 *   - `image`: `{ url, alt }`
 *   - `button`: `{ label, href }`
 *   - `spacer`: `{}` — a fixed-height gap, no content.
 *   - `html`: content lives in `htmlContent`, not `content` — see below.
 *
 * `html` is the one block type that isn't just markup-from-data: `htmlContent` is emitted into
 * the rendered page byte-for-byte, unescaped — the entire point of an "HTML block" is embedding
 * markup/CSS/script the other types can't express. That makes it a stored-XSS surface on every
 * visitor of the page the moment *any* role can write it, so it's kept in a field of its own
 * rather than folded into `content` — a role's write grant is checked per field
 * (`ratchet/auth`'s `resolveGrantedFields`/`assertWriteFieldsAllowed`, already enforced by the
 * generic `/api/blocks` router for every field on every model), so denying a role write access to
 * `htmlContent` specifically — while still letting it create/update every other block type via
 * the same `blocks:create`/`blocks:update` grant — falls out of that existing mechanism for free,
 * no bespoke permission plumbing needed.
 */
export const Block = defineModel('blocks', {
  fields: {
    type: field.enum(BLOCK_TYPES, { required: true, indexed: true }),
    content: field.json({ default: {} }),
    htmlContent: field.text({ required: false, displayText: 'HTML' }),
    order: field.integer({ default: 0, indexed: true }),
  },
  console: { hidden: true },
});
