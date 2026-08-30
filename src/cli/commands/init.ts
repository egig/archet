import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const RATCHET_VERSION = '^0.1.0';

function packageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'ratchet dev',
          serve: 'ratchet serve',
          generate: 'ratchet generate',
          migrate: 'ratchet migrate',
          studio: 'ratchet studio',
          build: 'tsc -p tsconfig.json',
          typecheck: 'tsc -p tsconfig.json --noEmit',
        },
        dependencies: {
          '@egig/ratchet': RATCHET_VERSION,
          'drizzle-orm': '^0.36.4',
          postgres: '^3.4.5',
          zod: '^3.24.1',
          // `react`/`react-dom` are `@egig/ratchet`'s `peerDependencies` — the console SPA and the
          // web app's SSR both need exactly one copy. `react-router` is what `routes/**` import
          // directly (loaders, `<Link>`, `useLoaderData`, …).
          react: '^19.2.0',
          'react-dom': '^19.2.0',
          'react-router': '^8.3.0',
        },
        devDependencies: {
          '@types/bun': '^1.4.0',
          '@types/react': '^19.2.0',
          '@types/react-dom': '^19.2.0',
          'drizzle-kit': '^0.28.1',
          typescript: '^5.7.2',
        },
      },
      null,
      2,
    ) + '\n'
  );
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src", "models", "routes", "logic", "ratchet.config.ts"],
  "exclude": ["dist", "node_modules", ".ratchet"]
}
`;

const RATCHET_CONFIG = `import { defineConfig } from '@egig/ratchet/core';

export default defineConfig({
  db: { connectionString: process.env.DATABASE_URL! },
  modelsDir: 'models',
  generatedDir: '.ratchet',
  migrationsDir: 'migrations',
});
`;

const EXAMPLE_MODEL = `import { defineModel, field } from '@egig/ratchet/core';

export const Example = defineModel('examples', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
  },
});
`;

const GITIGNORE = `node_modules/
dist/
.ratchet/
.env
*.log
`;

const ROOT_ROUTE = `import { Link, NavLink, Outlet, isRouteErrorResponse, useRouteError } from 'react-router';
import { Meta, Scripts, getWebContext } from '@egig/ratchet/web';
import { sql } from 'drizzle-orm';
import type { LoaderFunctionArgs } from 'react-router';

// The root route renders the whole HTML document. Its loader reads the console-editable "website"
// Domain Settings (site title, description, favicon, siteUrl, noindex) plus the published pages
// that opted into the header/footer nav (Pages → Navigation in the console).
interface NavPage {
  slug: string;
  title: string;
  navLocation: 'header' | 'footer';
}

export async function loader({ context }: LoaderFunctionArgs) {
  const { db, settings } = getWebContext(context);
  const [site, navRows] = await Promise.all([
    settings.get('website'),
    db.execute(
      sql\`select slug, title, nav_location as "navLocation" from pages
          where status = 'published' and nav_location in ('header', 'footer') and deleted_at is null
          order by nav_order asc, title asc\`,
    ),
  ]);
  return { site, nav: navRows as unknown as NavPage[] };
}

export const meta = ({ data }: { data: Awaited<ReturnType<typeof loader>> }) => {
  const site = data?.site ?? {};
  const title = typeof site.title === 'string' && site.title ? site.title : 'My site';
  const description = typeof site.description === 'string' ? site.description : '';
  const faviconUrl =
    site.favicon && typeof site.favicon === 'object' && 'url' in site.favicon ? String((site.favicon as { url: unknown }).url) : '';
  return [
    { title },
    ...(description ? [{ name: 'description', content: description }] : []),
    ...(site.noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    ...(faviconUrl ? [{ tagName: 'link' as const, rel: 'icon', href: faviconUrl }] : []),
  ];
};

export default function Root({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  const site = loaderData?.site ?? {};
  const nav = loaderData?.nav ?? [];
  const siteName = typeof site.title === 'string' && site.title ? site.title : 'My site';
  const header = nav.filter((p) => p.navLocation === 'header');
  const footer = nav.filter((p) => p.navLocation === 'footer');
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/theme.css" />
        <Meta />
      </head>
      <body>
        <header className="site-header">
          <div className="container site-header__inner">
            <Link to="/" className="site-header__brand">
              {siteName}
            </Link>
            <nav className="site-nav">
              {header.map((p) => (
                <NavLink key={p.slug} to={\`/\${p.slug}\`} className="site-nav__link">
                  {p.title}
                </NavLink>
              ))}
              <NavLink to="/contact" className="site-nav__link site-nav__link--cta">
                Contact
              </NavLink>
            </nav>
          </div>
        </header>

        <main className="site-main">
          <Outlet />
        </main>

        <footer className="site-footer">
          <div className="container site-footer__inner">
            <span>
              © {new Date().getFullYear()} {siteName}
            </span>
            <nav className="site-footer__nav">
              {footer.map((p) => (
                <Link key={p.slug} to={\`/\${p.slug}\`}>
                  {p.title}
                </Link>
              ))}
            </nav>
          </div>
        </footer>

        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const heading = isRouteErrorResponse(error) ? \`\${error.status} \${error.statusText}\` : 'Something went wrong';
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{heading}</title>
        <link rel="stylesheet" href="/theme.css" />
      </head>
      <body>
        <main className="site-main">
          <div className="container prose">
            <h1>{is404 ? 'Page not found' : heading}</h1>
            <p>{is404 ? "That page doesn't exist." : 'Please try again in a moment.'}</p>
            <p>
              <a href="/">Back to home</a>
            </p>
          </div>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
`;

const INDEX_ROUTE = `import { Link } from 'react-router';

export const meta = () => [{ title: 'Home' }];

// The landing page is hand-authored here (edit it freely). The other pages — About, Services,
// Terms, Privacy — are content-managed: they're rows in the "pages" table, edited in the console,
// and rendered by routes/$.tsx.
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="hero__eyebrow">Welcome</p>
          <h1 className="hero__title">A short, confident headline about what you do</h1>
          <p className="hero__lede">
            One or two sentences that say who you help and how. Keep it concrete — the visitor should
            know within seconds whether they're in the right place.
          </p>
          <div className="hero__actions">
            <Link to="/contact" className="button button--primary">
              Get in touch
            </Link>
            <Link to="/services" className="button button--ghost">
              See what we do
            </Link>
          </div>
        </div>
      </section>

      <section className="features container">
        <div className="feature">
          <h2>First thing</h2>
          <p>Explain one concrete benefit. Swap this copy for something true about your work.</p>
        </div>
        <div className="feature">
          <h2>Second thing</h2>
          <p>Another benefit, or a step in how you work. Short paragraphs read best here.</p>
        </div>
        <div className="feature">
          <h2>Third thing</h2>
          <p>A final reason to trust you — experience, a guarantee, a way you're different.</p>
        </div>
      </section>

      <section className="cta">
        <div className="container">
          <h2>Ready to start?</h2>
          <p>Tell us what you're working on and we'll get back to you.</p>
          <Link to="/contact" className="button button--primary">
            Contact us
          </Link>
        </div>
      </section>
    </>
  );
}
`;

const SPLAT_ROUTE = `import { data, useLoaderData } from 'react-router';
import { sql } from 'drizzle-orm';
import { getWebContext } from '@egig/ratchet/web';
import type { LoaderFunctionArgs } from 'react-router';

// Renders a content-managed page (a published row in the "pages" table) by its slug. Any URL that
// isn't matched by a more specific route file lands here; an unknown slug throws a 404 that the
// root ErrorBoundary renders.
interface PageRow {
  title: string;
  body: string;
  metaDescription: string | null;
}

export async function loader({ params, context }: LoaderFunctionArgs) {
  const slug = params['*'] ?? '';
  const { db, settings } = getWebContext(context);
  const [rows, site] = await Promise.all([
    db.execute(
      sql\`select title, body, meta_description as "metaDescription" from pages
          where slug = \${slug} and status = 'published' and deleted_at is null limit 1\`,
    ),
    settings.get('website'),
  ]);
  const page = (rows as unknown as PageRow[])[0];
  if (!page) throw data('Not found', { status: 404 });
  const siteUrl = typeof site.siteUrl === 'string' ? site.siteUrl.replace(/\\/+$/, '') : '';
  return { page, canonical: siteUrl ? \`\${siteUrl}/\${slug}\` : null };
}

export const meta = ({ data: d }: { data: Awaited<ReturnType<typeof loader>> }) => {
  if (!d) return [{ title: 'Not found' }];
  return [
    { title: d.page.title },
    ...(d.page.metaDescription ? [{ name: 'description', content: d.page.metaDescription }] : []),
    ...(d.canonical ? [{ tagName: 'link' as const, rel: 'canonical', href: d.canonical }] : []),
  ];
};

export default function ContentPage() {
  const { page } = useLoaderData<typeof loader>();
  return (
    <article className="container prose">
      <h1>{page.title}</h1>
      {/* page.body is sanitized server-side on every write (see @egig/ratchet's sanitizeBody). */}
      <div dangerouslySetInnerHTML={{ __html: page.body }} />
    </article>
  );
}
`;

const CONTACT_ROUTE = `import { Form, useActionData, useNavigation } from 'react-router';
import { sql } from 'drizzle-orm';
import { getWebContext } from '@egig/ratchet/web';
import type { ActionFunctionArgs } from 'react-router';

const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

// Runs on the server only. Inserts a row into the builtin "contacts" model — no public API is
// exposed for it, so this is the submission path. "company" is a honeypot: a real person never
// sees or fills it.
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  if (form.get('company')) return { ok: true as const }; // bot — pretend it worked

  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const message = String(form.get('message') ?? '').trim();

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Please enter your name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.';
  if (!message) errors.message = 'Please enter a message.';
  if (Object.keys(errors).length > 0) return { ok: false as const, errors, values: { name, email, message } };

  const { db } = getWebContext(context);
  await db.execute(
    sql\`insert into contacts (id, created_at, updated_at, name, email, message, status)
        values (\${crypto.randomUUID()}, now(), now(), \${name}, \${email}, \${message}, 'new')\`,
  );
  return { ok: true as const };
}

export const meta = () => [{ title: 'Contact' }];

export default function Contact() {
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const errors: Record<string, string> = result && !result.ok ? result.errors : {};
  const values = result && !result.ok ? result.values : { name: '', email: '', message: '' };

  if (result?.ok) {
    return (
      <div className="container prose">
        <h1>Thanks — we got your message</h1>
        <p>We'll get back to you as soon as we can.</p>
      </div>
    );
  }

  return (
    <div className="container prose">
      <h1>Contact</h1>
      <p>Send us a message and we'll reply by email.</p>
      <Form method="post" className="form" replace>
        <p className="form__hp" aria-hidden="true">
          <label>
            Company <input type="text" name="company" tabIndex={-1} autoComplete="off" />
          </label>
        </p>
        <label className="form__field">
          <span>Name</span>
          <input type="text" name="name" defaultValue={values.name} required />
          {errors.name ? <span className="form__error">{errors.name}</span> : null}
        </label>
        <label className="form__field">
          <span>Email</span>
          <input type="email" name="email" defaultValue={values.email} required />
          {errors.email ? <span className="form__error">{errors.email}</span> : null}
        </label>
        <label className="form__field">
          <span>Message</span>
          <textarea name="message" rows={6} defaultValue={values.message} required />
          {errors.message ? <span className="form__error">{errors.message}</span> : null}
        </label>
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send message'}
        </button>
      </Form>
    </div>
  );
}
`;

// Served as a static file from public/ (linked by routes/root.tsx). One neutral, production-ready
// theme that reads well for a business or a personal site — retune it by editing the tokens in
// :root. Light + dark, one accent colour, typographic defaults for the content pages.
const THEME_CSS = `:root {
  --accent: #2563eb;
  --accent-contrast: #ffffff;
  --bg: #ffffff;
  --bg-subtle: #f6f7f9;
  --surface: #ffffff;
  --text: #1a1d23;
  --text-muted: #5b6470;
  --border: #e4e7eb;
  --radius: 10px;
  --container: 68rem;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-heading: var(--font);
}

@media (prefers-color-scheme: dark) {
  :root {
    --accent: #60a5fa;
    --accent-contrast: #0b1220;
    --bg: #0d1117;
    --bg-subtle: #12161d;
    --surface: #161b22;
    --text: #e8eaed;
    --text-muted: #9aa4b2;
    --border: #262c36;
  }
}

* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  font-family: var(--font);
  font-size: 1.0625rem;
  line-height: 1.65;
  color: var(--text);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.container {
  width: 100%;
  max-width: var(--container);
  margin-inline: auto;
  padding-inline: 1.5rem;
}

a { color: var(--accent); text-underline-offset: 2px; }

h1, h2, h3 { font-family: var(--font-heading); line-height: 1.2; font-weight: 650; letter-spacing: -0.01em; }

/* Header ------------------------------------------------------------------ */
.site-header { border-bottom: 1px solid var(--border); background: var(--surface); }
.site-header__inner { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; min-height: 4rem; }
.site-header__brand { font-weight: 700; font-size: 1.125rem; color: var(--text); text-decoration: none; }
.site-nav { display: flex; align-items: center; gap: 0.5rem 1.25rem; flex-wrap: wrap; }
.site-nav__link { color: var(--text-muted); text-decoration: none; font-size: 0.95rem; padding: 0.35rem 0; }
.site-nav__link:hover, .site-nav__link.active { color: var(--text); }
.site-nav__link--cta {
  color: var(--accent-contrast);
  background: var(--accent);
  padding: 0.45rem 0.9rem;
  border-radius: var(--radius);
}
.site-nav__link--cta:hover { color: var(--accent-contrast); filter: brightness(0.95); }

/* Main / footer --------------------------------------------------------- */
.site-main { flex: 1; padding-block: 3.5rem; }
.site-footer { border-top: 1px solid var(--border); background: var(--surface); color: var(--text-muted); font-size: 0.9rem; }
.site-footer__inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; min-height: 4rem; }
.site-footer__nav { display: flex; gap: 1.25rem; flex-wrap: wrap; }
.site-footer a { color: var(--text-muted); }
.site-footer a:hover { color: var(--text); }

/* Content pages -------------------------------------------------------- */
.prose { max-width: 44rem; }
.prose h1 { font-size: clamp(1.9rem, 4vw, 2.5rem); margin: 0 0 1.5rem; }
.prose h2 { font-size: 1.4rem; margin: 2.5rem 0 0.75rem; }
.prose h3 { font-size: 1.15rem; margin: 2rem 0 0.5rem; }
.prose p, .prose ul, .prose ol, .prose blockquote { margin: 0 0 1.15rem; }
.prose ul, .prose ol { padding-left: 1.4rem; }
.prose li { margin-bottom: 0.35rem; }
.prose blockquote {
  margin-inline: 0;
  padding-left: 1rem;
  border-left: 3px solid var(--border);
  color: var(--text-muted);
}
.prose pre {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  overflow-x: auto;
}
.prose code { font-size: 0.9em; }
.prose :not(pre) > code { background: var(--bg-subtle); padding: 0.1rem 0.35rem; border-radius: 4px; }
.prose img { max-width: 100%; height: auto; border-radius: var(--radius); }

/* Landing page -------------------------------------------------------- */
.hero { padding-block: 1rem 3.5rem; }
.hero__eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.8rem; font-weight: 600; color: var(--accent); margin: 0 0 0.75rem; }
.hero__title { font-size: clamp(2rem, 5.5vw, 3.25rem); margin: 0 0 1rem; max-width: 20ch; }
.hero__lede { font-size: 1.2rem; color: var(--text-muted); max-width: 46ch; margin: 0 0 2rem; }
.hero__actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }

.features {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  padding-block: 3.5rem;
  border-top: 1px solid var(--border);
}
.feature h2 { font-size: 1.15rem; margin: 0 0 0.5rem; }
.feature p { margin: 0; color: var(--text-muted); }

.cta { background: var(--bg-subtle); border-top: 1px solid var(--border); padding-block: 3.5rem; text-align: center; }
.cta h2 { font-size: 1.6rem; margin: 0 0 0.5rem; }
.cta p { color: var(--text-muted); margin: 0 0 1.5rem; }

/* Buttons ----------------------------------------------------------- */
.button {
  display: inline-block;
  padding: 0.7rem 1.35rem;
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 0.98rem;
  text-decoration: none;
  border: 1px solid transparent;
  cursor: pointer;
}
.button--primary { background: var(--accent); color: var(--accent-contrast); }
.button--primary:hover { filter: brightness(0.95); }
.button--primary:disabled { opacity: 0.6; cursor: default; }
.button--ghost { border-color: var(--border); color: var(--text); background: var(--surface); }
.button--ghost:hover { border-color: var(--text-muted); }

/* Contact form --------------------------------------------------- */
.form { display: flex; flex-direction: column; gap: 1.1rem; max-width: 32rem; margin-top: 1.5rem; }
.form__hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.form__field { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.95rem; }
.form__field span { font-weight: 600; }
.form input, .form textarea {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.6rem 0.75rem;
}
.form input:focus, .form textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }
.form__error { color: #dc2626; font-size: 0.85rem; }
`;

function sanitizePackageName(dirName: string): string {
  const cleaned = dirName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'ratchet-app';
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeIfAbsent(filePath: string, content: string, label: string): Promise<void> {
  if (await exists(filePath)) {
    console.log(`skipped ${label} (already exists)`);
    return;
  }
  await writeFile(filePath, content, 'utf8');
  console.log(`wrote ${label}`);
}

async function appendGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!(await exists(gitignorePath))) {
    await writeFile(gitignorePath, GITIGNORE, 'utf8');
    console.log('wrote .gitignore');
    return;
  }
  const existing = await readFile(gitignorePath, 'utf8');
  if (!existing.includes('.ratchet')) {
    await writeFile(gitignorePath, `${existing}\n# ratchet\n${GITIGNORE}`, 'utf8');
    console.log('updated .gitignore');
  } else {
    console.log('skipped .gitignore (already covers .ratchet)');
  }
}

/** Scaffolds a full starter project — package.json, tsconfig.json, ratchet.config.ts, an example
 * model, drizzle/migrations/, and a working public site: a hand-authored landing page plus the
 * routes that render the console-managed pages (About/Services/Terms/Privacy — seeded on first
 * `/setup`) and the contact form. No server entry file to write: `ratchet serve` (framework-owned,
 * see src/cli/commands/serve.ts) boots the API directly from ratchet.config.ts + the generated
 * registry. Never overwrites a file that's already there — safe to re-run in a partially set-up
 * directory. */
export async function runInit(cwd: string): Promise<void> {
  await mkdir(path.join(cwd, 'models'), { recursive: true });
  await mkdir(path.join(cwd, '.ratchet'), { recursive: true });
  await mkdir(path.join(cwd, 'drizzle', 'migrations'), { recursive: true });
  await mkdir(path.join(cwd, 'routes'), { recursive: true });
  await mkdir(path.join(cwd, 'public'), { recursive: true });

  const pkgName = sanitizePackageName(path.basename(cwd));
  await writeIfAbsent(path.join(cwd, 'package.json'), packageJson(pkgName), 'package.json');
  await writeIfAbsent(path.join(cwd, 'tsconfig.json'), TSCONFIG, 'tsconfig.json');
  await writeIfAbsent(path.join(cwd, 'ratchet.config.ts'), RATCHET_CONFIG, 'ratchet.config.ts');
  await writeIfAbsent(path.join(cwd, 'models', 'example.model.ts'), EXAMPLE_MODEL, 'models/example.model.ts');
  await writeIfAbsent(path.join(cwd, 'routes', 'root.tsx'), ROOT_ROUTE, 'routes/root.tsx');
  await writeIfAbsent(path.join(cwd, 'routes', 'index.tsx'), INDEX_ROUTE, 'routes/index.tsx');
  await writeIfAbsent(path.join(cwd, 'routes', '$.tsx'), SPLAT_ROUTE, 'routes/$.tsx');
  await writeIfAbsent(path.join(cwd, 'routes', 'contact.tsx'), CONTACT_ROUTE, 'routes/contact.tsx');
  await writeIfAbsent(path.join(cwd, 'public', 'theme.css'), THEME_CSS, 'public/theme.css');
  await appendGitignore(cwd);

  console.log('');
  console.log('next steps:');
  console.log('  1. bun install');
  console.log('  2. set DATABASE_URL');
  console.log('  3. bun run generate   (writes .ratchet/* + SQL migration files)');
  console.log('  4. bun run migrate && bun run serve   (or `bun run dev` for local push-based iteration)');
  console.log('  5. open the console, complete setup — starter pages are seeded automatically');
}
