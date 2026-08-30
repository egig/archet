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

const ROOT_ROUTE = `import { Outlet, isRouteErrorResponse, useRouteError } from 'react-router';
import { Meta, Scripts, getWebContext } from '@egig/ratchet/web';
import type { LoaderFunctionArgs } from 'react-router';

// The root route renders the whole HTML document. Its loader reads the website Domain Settings
// (console-editable: site title, favicon, headHtml, globalCss, …) off the injected \`context\`.
export async function loader({ context }: LoaderFunctionArgs) {
  const settings = await getWebContext(context).settings.get('website');
  return { settings };
}

export const meta = ({ data }: { data: Awaited<ReturnType<typeof loader>> }) => {
  const title = typeof data?.settings?.title === 'string' ? data.settings.title : 'My site';
  return [{ title }];
};

export default function Root({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  const settings = loaderData?.settings ?? {};
  const globalCss = typeof settings.globalCss === 'string' ? settings.globalCss : '';
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        {globalCss ? <style dangerouslySetInnerHTML={{ __html: globalCss }} /> : null}
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const heading = isRouteErrorResponse(error) ? \`\${error.status} \${error.statusText}\` : 'Something went wrong';
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{heading}</title>
      </head>
      <body>
        <h1>{heading}</h1>
        <Scripts />
      </body>
    </html>
  );
}
`;

const INDEX_ROUTE = `export const meta = () => [{ title: 'Home' }];

export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 640, margin: '0 auto' }}>
      <h1>It works</h1>
      <p>
        Edit <code>routes/index.tsx</code>, or add <code>routes/about.tsx</code>,{' '}
        <code>routes/blog/$slug.tsx</code>, … Loaders run on the server with a{' '}
        <code>context</code> (db, session, settings).
      </p>
    </main>
  );
}
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

/** §6/§10: scaffolds a full starter project — package.json, tsconfig.json, ratchet.config.ts,
 * an example model, and drizzle/migrations/. No server entry file to write: `ratchet serve`
 * (framework-owned, see src/cli/commands/serve.ts) boots the API directly from
 * ratchet.config.ts + the generated registry. Never overwrites a file that's already there —
 * safe to re-run in a partially set-up directory. */
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
  await appendGitignore(cwd);

  console.log('');
  console.log('next steps:');
  console.log('  1. bun install');
  console.log('  2. set DATABASE_URL');
  console.log('  3. bun run generate   (writes .ratchet/* + SQL migration files)');
  console.log('  4. bun run migrate && bun run serve   (or `bun run dev` for local push-based iteration)');
}
