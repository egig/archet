import { defineModel, field } from '../../core/index.js';

/**
 * A message submitted through the public site's contact form. Ratchet never exposes a public
 * write endpoint for this model — the scaffolded `routes/contact.tsx` (see `cli/commands/init.ts`)
 * inserts rows straight through its loader `context.db`, with its own honeypot + validation — so
 * `contacts` stays permission-gated like every other model and the console is the only place a
 * row is read, triaged (`status`), or deleted. There is deliberately no console *create* form
 * flow worth special-casing; the generated one is harmless but submissions come from the site.
 *
 * `createdAt` (every model has it) is the submission time. Add your own `subject`/`phone`/etc. by
 * authoring a `contacts.model.ts` in your project — a scanned model of the same name wins over
 * this builtin.
 */
export const Contact = defineModel('contacts', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
    email: field.string({ required: true, maxLength: 320 }),
    message: field.text({ required: true }),
    status: field.enum(['new', 'read', 'archived'] as const, {
      default: 'new',
      indexed: true,
      description: 'Triage state — new submissions arrive as “new”.',
    }),
  },
  console: { label: 'Contacts', displayField: 'email' },
});
