import { defineModel, field } from '@egig/ratchet/core';

/**
 * A message submitted through the public site's contact form (routes/contact.tsx). That route's
 * server `action` inserts rows straight through its loader `context.db` with its own honeypot +
 * validation — there's no public write API — so `contacts` stays permission-gated like every other
 * model and the console is the only place a row is read, triaged (`status`), or deleted.
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
