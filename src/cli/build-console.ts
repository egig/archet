import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as esbuild from 'esbuild';
import type { resolveDirs } from './load-config.js';

type Dirs = ReturnType<typeof resolveDirs>;

export interface ConsoleClientHandle {
  /** No-op in prod mode, which is a one-shot build with nothing left running to stop. */
  stop: () => Promise<void>;
}

export interface BuildConsoleClientOptions {
  watch: boolean;
  mode: 'dev' | 'prod';
}

const NOOP_HANDLE: ConsoleClientHandle = { stop: async () => {} };

/** The framework-owned console client entry (`main.tsx`) and its Tailwind source (`styles.css`) —
 * resolved relative to this module rather than a consumer path, since `ConsoleApp` has no
 * consumer-facing extension points left to author an entry around (see ConsoleApp.tsx). Checks for
 * `main.tsx` first (running from source under `tsx`, e.g. this repo's own `example/`) and falls
 * back to the compiled `main.js` (running from a published `dist/`, e.g. a real consumer's
 * `node_modules/@egig/ratchet`) — both live one directory up from this file's own location. */
function frameworkConsoleClientDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'console', 'client');
}

function frameworkConsoleEntry(): string {
  const dir = frameworkConsoleClientDir();
  const source = path.join(dir, 'main.tsx');
  return existsSync(source) ? source : path.join(dir, 'main.js');
}

function frameworkCssEntry(): string | null {
  const cssFile = path.join(frameworkConsoleClientDir(), 'styles.css');
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

/** Bundles the framework's own console client entry with esbuild — every app gets the same
 * console UI (see ConsoleApp.tsx), so this always runs, unconditionally. Runs Tailwind's
 * standalone CLI against the framework's `styles.css`, and writes
 * `<generatedDir>/console/manifest.json` mapping logical names to the actual (optionally
 * content-hashed) asset paths. `dirs.consolePath` and `dirs.brand` are inlined into the bundle via
 * esbuild's `define` (`__CONSOLE_PATH__`/`__CONSOLE_BRAND__`, declared ambiently in
 * src/console/client/env.d.ts) — the client needs them for the router `basename`/API prefix and
 * the sidebar heading respectively, and has no other runtime config channel (it's served as a
 * static bundle, including from a pure edge CDN with no per-request server involved). Changing
 * either therefore requires a rebuild. */
export async function buildConsoleClient(dirs: Dirs, options: BuildConsoleClientOptions): Promise<ConsoleClientHandle> {
  const consoleDir = path.join(dirs.generatedDir, 'console');
  const assetsDir = path.join(consoleDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const cssEntry = frameworkCssEntry();
  const manifest: Record<string, string> = {};

  const esbuildOptions: esbuild.BuildOptions = {
    entryPoints: { main: frameworkConsoleEntry() },
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
    define: {
      __CONSOLE_PATH__: JSON.stringify(dirs.consolePath),
      __CONSOLE_BRAND__: JSON.stringify(dirs.brand),
    },
  };

  if (options.mode === 'dev') {
    // Fixed filenames in dev (Q5) — write the manifest once, up front, no metafile parsing needed.
    manifest['main.js'] = 'assets/main.js';
    if (cssEntry) manifest['main.css'] = 'assets/main.css';
    await writeFile(path.join(consoleDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

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
  if (!jsOutput) throw new Error('esbuild produced no JS output for the console client entry');
  manifest['main.js'] = path.relative(consoleDir, jsOutput);

  if (cssEntry) {
    const tmpCss = path.join(assetsDir, 'main.css');
    await runTailwindOnce(cssEntry, tmpCss, true);
    const hash = await hashFile(tmpCss);
    const hashedCss = path.join(assetsDir, `main-${hash}.css`);
    await rename(tmpCss, hashedCss);
    manifest['main.css'] = path.relative(consoleDir, hashedCss);
  }

  await writeFile(path.join(consoleDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return NOOP_HANDLE;
}

/** Edge-runtime groundwork only (see plan Context) — bundles a generated, statically-importing
 * server entry into one file. Does NOT change `ratchet serve`/`ratchet dev`'s runtime behavior,
 * which keep loading the registry dynamically via tsx. `/api/auth` and `/api` are registered
 * before the console router so they keep precedence when `consolePath` is '/' (the console's own
 * catch-all would otherwise swallow every path — see `FrameworkConfig.consolePath`). */
export async function buildServerBundle(cwd: string, dirs: Dirs): Promise<void> {
  const entrySrc = [
    `// GENERATED by \`ratchet build\` — do not edit.`,
    `import { serve } from '@hono/node-server';`,
    `import { Hono } from 'hono';`,
    `import { drizzle } from 'drizzle-orm/postgres-js';`,
    `import postgres from 'postgres';`,
    `import { createApiRouter, buildRegistryMap, buildDomainSettingsRegistryMap } from '@egig/ratchet/router';`,
    `import { createAuthRouter } from '@egig/ratchet/auth';`,
    `import { createConsoleRouter } from '@egig/ratchet/console';`,
    `import { createNodeFsAssetSource } from '@egig/ratchet/console/node';`,
    `import * as registryModule from './registry.js';`,
    `import * as domainsModule from './domains.js';`,
    ``,
    `const connectionString = process.env.DATABASE_URL!;`,
    `const registry = buildRegistryMap(registryModule as Record<string, unknown>);`,
    `const domainSettingsRegistry = buildDomainSettingsRegistryMap(domainsModule as Record<string, unknown>);`,
    `const client = postgres(connectionString);`,
    `const db = drizzle(client);`,
    ``,
    `const app = new Hono();`,
    `app.route('/api/auth', createAuthRouter(db));`,
    `app.route('/api', createApiRouter(registry, db));`,
    `app.route(${JSON.stringify(dirs.consolePath)}, createConsoleRouter(createNodeFsAssetSource(${JSON.stringify(path.relative(cwd, dirs.generatedDir))}), registry, db, ${JSON.stringify(dirs.consolePath)}, domainSettingsRegistry));`,
    ``,
    `const port = Number(process.env.PORT ?? 3000);`,
    `serve({ fetch: app.fetch, port }, (info) => {`,
    `  console.log(\`ratchet listening on http://localhost:\${info.port}\`);`,
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
