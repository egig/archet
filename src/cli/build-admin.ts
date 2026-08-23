import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as esbuild from 'esbuild';
import type { resolveDirs } from './load-config.js';

type Dirs = ReturnType<typeof resolveDirs>;

export interface AdminClientHandle {
  /** No-op if the admin entry didn't exist and nothing was started. */
  stop: () => Promise<void>;
}

export interface BuildAdminClientOptions {
  watch: boolean;
  mode: 'dev' | 'prod';
}

const NOOP_HANDLE: AdminClientHandle = { stop: async () => {} };

function cssEntryFor(adminEntryFile: string): string | null {
  const cssFile = path.join(path.dirname(adminEntryFile), 'styles.css');
  return existsSync(cssFile) ? cssFile : null;
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha1').update(content).digest('hex').slice(0, 8);
}

function runTailwindOnce(input: string, output: string, minify: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['tailwindcss', '--input', input, '--output', output];
    if (minify) args.push('--minify');
    const child = spawn('npx', args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tailwindcss exited with code ${code}`))));
    child.on('error', reject);
  });
}

function spawnTailwindWatch(input: string, output: string): ChildProcess {
  return spawn('npx', ['tailwindcss', '--input', input, '--output', output, '--watch=always'], { stdio: 'inherit' });
}

async function killChild(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
  });
}

/** Bundles `dirs.adminEntryFile` (skips, logging, if it doesn't exist — apps that haven't
 * adopted admin yet must stay unaffected) with esbuild, runs Tailwind's standalone CLI
 * against a sibling `styles.css` if present, and writes `<generatedDir>/admin/manifest.json`
 * mapping logical names to the actual (optionally content-hashed) asset paths. */
export async function buildAdminClient(dirs: Dirs, options: BuildAdminClientOptions): Promise<AdminClientHandle> {
  if (!existsSync(dirs.adminEntryFile)) {
    console.log(`[admin] no entry at ${dirs.adminEntryFile} — skipping admin client build`);
    return NOOP_HANDLE;
  }

  const adminDir = path.join(dirs.generatedDir, 'admin');
  const assetsDir = path.join(adminDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const cssEntry = cssEntryFor(dirs.adminEntryFile);
  const manifest: Record<string, string> = {};

  const esbuildOptions: esbuild.BuildOptions = {
    entryPoints: { main: dirs.adminEntryFile },
    bundle: true,
    outdir: assetsDir,
    entryNames: options.mode === 'prod' ? '[name]-[hash]' : '[name]',
    platform: 'browser',
    format: 'esm',
    jsx: 'automatic',
    sourcemap: options.mode === 'dev',
    minify: options.mode === 'prod',
    metafile: true,
    logLevel: 'info',
  };

  if (options.mode === 'dev') {
    // Fixed filenames in dev (Q5) — write the manifest once, up front, no metafile parsing needed.
    manifest['main.js'] = 'assets/main.js';
    if (cssEntry) manifest['main.css'] = 'assets/main.css';
    await writeFile(path.join(adminDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    const ctx = await esbuild.context(esbuildOptions);
    await ctx.watch();

    const tailwindChild = cssEntry ? spawnTailwindWatch(cssEntry, path.join(assetsDir, 'main.css')) : null;

    return {
      stop: async () => {
        await ctx.dispose();
        if (tailwindChild) await killChild(tailwindChild);
      },
    };
  }

  // prod: one-shot build, hashed filenames, manifest derived from the actual output.
  const result = await esbuild.build(esbuildOptions);
  const jsOutput = Object.keys(result.metafile!.outputs).find(
    (file) => file.endsWith('.js') && result.metafile!.outputs[file]!.entryPoint,
  );
  if (!jsOutput) throw new Error('esbuild produced no JS output for the admin client entry');
  manifest['main.js'] = path.relative(adminDir, jsOutput);

  if (cssEntry) {
    const tmpCss = path.join(assetsDir, 'main.css');
    await runTailwindOnce(cssEntry, tmpCss, true);
    const hash = await hashFile(tmpCss);
    const hashedCss = path.join(assetsDir, `main-${hash}.css`);
    await rename(tmpCss, hashedCss);
    manifest['main.css'] = path.relative(adminDir, hashedCss);
  }

  await writeFile(path.join(adminDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return NOOP_HANDLE;
}

/** Edge-runtime groundwork only (see plan Context) — bundles a generated, statically-importing
 * server entry into one file. Does NOT change `archet serve`/`archet dev`'s runtime behavior,
 * which keep loading the registry dynamically via tsx. */
export async function buildServerBundle(cwd: string, dirs: Dirs): Promise<void> {
  const entrySrc = [
    `// GENERATED by \`archet build\` — do not edit.`,
    `import path from 'node:path';`,
    `import { serve } from '@hono/node-server';`,
    `import { Hono } from 'hono';`,
    `import { drizzle } from 'drizzle-orm/postgres-js';`,
    `import postgres from 'postgres';`,
    `import { createApiRouter, buildRegistryMap } from 'archet/router';`,
    `import { createAuthRouter } from 'archet/auth';`,
    `import { createAdminRouter } from 'archet/admin';`,
    `import * as registryModule from './registry.js';`,
    ``,
    `const connectionString = process.env.DATABASE_URL!;`,
    `const registry = buildRegistryMap(registryModule as Record<string, unknown>);`,
    `const client = postgres(connectionString);`,
    `const db = drizzle(client);`,
    ``,
    `const app = new Hono();`,
    `app.route('/admin', createAdminRouter(${JSON.stringify(path.relative(cwd, dirs.generatedDir))}, registry, db));`,
    `app.route('/api/auth', createAuthRouter(db));`,
    `app.route('/api', createApiRouter(registry, db));`,
    ``,
    `const port = Number(process.env.PORT ?? 3000);`,
    `serve({ fetch: app.fetch, port }, (info) => {`,
    `  console.log(\`archet listening on http://localhost:\${info.port}\`);`,
    `});`,
    ``,
  ].join('\n');

  const entryFile = path.join(dirs.generatedDir, 'server-entry.ts');
  await writeFile(entryFile, entrySrc, 'utf8');

  await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: path.join(cwd, 'dist', 'server.js'),
    logLevel: 'info',
  });
}
