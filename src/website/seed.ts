import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { insertRow } from '../core/persistence.js';
import { updateDomainSettings } from '../core/domain-settings-persistence.js';
import { Page } from './models/page.model.js';
import { WebsiteDomain } from './domain.js';

type AnyDb = PgDatabase<any, any, any>;

/** Placeholder site name in the seeded content + settings — an editor replaces it in the console
 * (Settings → Website, and the page bodies) right after setup. Kept obviously-a-placeholder. */
const ORG = 'Your Company';

interface SeedPage {
  slug: string;
  title: string;
  metaDescription: string;
  navLocation: 'header' | 'footer';
  navOrder: number;
  body: string;
}

const PAGES: SeedPage[] = [
  {
    slug: 'about',
    title: 'About',
    metaDescription: `Learn about ${ORG} — who we are and what we do.`,
    navLocation: 'header',
    navOrder: 1,
    body: [
      `<p>${ORG} is a small team that cares a great deal about doing good work. This page is placeholder copy — edit it in the console under <strong>Pages → About</strong>.</p>`,
      `<h2>Our story</h2>`,
      `<p>Tell people how the company started, what problem you set out to solve, and why it matters. A paragraph or two is plenty.</p>`,
      `<h2>How we work</h2>`,
      `<ul><li>Be straight with people.</li><li>Ship things that last.</li><li>Leave it better than we found it.</li></ul>`,
    ].join('\n'),
  },
  {
    slug: 'services',
    title: 'Services',
    metaDescription: `What ${ORG} can do for you.`,
    navLocation: 'header',
    navOrder: 2,
    body: [
      `<p>Placeholder copy — describe what you offer under <strong>Pages → Services</strong>.</p>`,
      `<h2>What we offer</h2>`,
      `<ul><li><strong>Consulting</strong> — short engagements to get unstuck.</li><li><strong>Build</strong> — end-to-end delivery of a project.</li><li><strong>Support</strong> — ongoing help once you're live.</li></ul>`,
      `<h2>Getting started</h2>`,
      `<p>The best first step is a conversation. <a href="/contact">Get in touch</a> and we'll take it from there.</p>`,
    ].join('\n'),
  },
  {
    slug: 'terms',
    title: 'Terms of Service',
    metaDescription: `Terms of Service for ${ORG}.`,
    navLocation: 'footer',
    navOrder: 1,
    body: [
      `<p><em>This is placeholder text and not legal advice.</em> Replace it with terms reviewed by a lawyer before you launch.</p>`,
      `<h2>Use of the site</h2>`,
      `<p>By using this website you agree to these terms. If you don't agree, please don't use the site.</p>`,
      `<h2>Content</h2>`,
      `<p>All content on this site is owned by ${ORG} unless stated otherwise.</p>`,
      `<h2>Contact</h2>`,
      `<p>Questions about these terms? <a href="/contact">Contact us</a>.</p>`,
    ].join('\n'),
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    metaDescription: `How ${ORG} handles your data.`,
    navLocation: 'footer',
    navOrder: 2,
    body: [
      `<p><em>This is placeholder text and not legal advice.</em> Replace it with a policy that reflects what you actually collect.</p>`,
      `<h2>What we collect</h2>`,
      `<p>When you submit the contact form we store the name, email address, and message you provide, so we can reply.</p>`,
      `<h2>What we don't do</h2>`,
      `<p>We don't sell your information.</p>`,
      `<h2>Contact</h2>`,
      `<p>To ask what we hold about you, or to have it deleted, <a href="/contact">get in touch</a>.</p>`,
    ].join('\n'),
  },
];

/** Idempotent first-run content seed, run inside the `/api/auth/setup` transaction (see
 * `auth/router.ts`) so a fresh instance's public site isn't empty. No-op once any `Page` row
 * exists. Seeds the four starter pages (about/services/terms/privacy) plus the `website` Domain
 * Settings `title`/`description`. The home page and the contact page are scaffolded route files
 * (`routes/index.tsx`, `routes/contact.tsx`), not `Page` rows. */
export async function seedWebsite(db: AnyDb): Promise<void> {
  const existing = await db.execute(sql`SELECT 1 FROM ${sql.identifier('pages')} LIMIT 1`);
  if ((existing as unknown as unknown[]).length > 0) return;

  const now = new Date();
  for (const page of PAGES) {
    await insertRow(db, Page, { ...page, status: 'published', publishedAt: now });
  }

  const current = await getWebsiteTitle(db);
  if (!current) {
    await updateDomainSettings(db, WebsiteDomain, {
      title: ORG,
      description: `${ORG} — placeholder site description. Edit this under Settings → Website.`,
    });
  }
}

async function getWebsiteTitle(db: AnyDb): Promise<string | null> {
  const rows = await db.execute(
    sql`SELECT ${sql.identifier('values')} FROM ${sql.identifier('ratchet_domain_settings')} WHERE ${sql.identifier('domain')} = ${'website'} LIMIT 1`,
  );
  const row = (rows as unknown as { values: Record<string, unknown> }[])[0];
  const title = row?.values?.title;
  return typeof title === 'string' && title.length > 0 ? title : null;
}
