import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { resolveDirs } from './load-config.js';
import { serverExportsPlugin } from '../web/transform-server-exports.js';

type Dirs = ReturnType<typeof resolveDirs>;

export interface WebClientHandle {
  /** map of logical name -> built asset path relative to `<generatedDir>/web` */
  manifest: Record<string, string>;
  stop: () => Promise<void>;
}

const NOOP: WebClientHandle = { manifest: {}, stop: async () => {} };

/** The framework-owned web client entry (`entry.client.tsx`) — resolved relative to this module
 * (source under Bun, compiled `.js` from a published `dist/`), never a consumer path: there's no
 * per-app entry to author (mirrors `build-console.ts`'s `frameworkConsoleEntry`). */
function frameworkWebEntry(): string {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
  const source = path.join(dir, 'entry.client.tsx');
  return existsSync(source) ? source : path.join(dir, 'entry.client.js');
}

function appRoutesVirtualPlugin(clientManifestFile: string): Bun.BunPlugin {
  return {
    name: 'ratchet-app-routes',
    setup(build) {
      build.onResolve({ filter: /^ratchet:app-routes$/ }, () => ({ path: clientManifestFile }));
    },
  };
}

export interface BuildWebClientOptions {
  mode: 'dev' | 'prod';
}

/** Bundles the framework web client entry with `Bun.build` — the generated
 * `.ratchet/app-routes.client.ts` (via the `ratchet:app-routes` virtual module) is the only
 * per-app input. The `serverExportsPlugin` strips `loader`/`action`/`headers` from route modules
 * and empties `*.server` imports for the browser build. Writes `<generatedDir>/web/manifest.json`.
 *
 * No-ops when the site isn't opted into (no generated client manifest). TODO(phase 6): a dev
 * watch loop mirroring `buildConsoleClient` (Bun.build has no incremental watch API).
 */
export async function buildWebClient(dirs: Dirs, options: BuildWebClientOptions): Promise<WebClientHandle> {
  const clientManifestFile = path.join(dirs.generatedDir, 'app-routes.client.ts');
  if (!existsSync(clientManifestFile)) return NOOP;

  const webDir = path.join(dirs.generatedDir, 'web');
  const assetsDir = path.join(webDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [frameworkWebEntry()],
    outdir: assetsDir,
    naming: options.mode === 'prod' ? '[dir]/[name]-[hash].[ext]' : '[dir]/[name].[ext]',
    target: 'browser',
    format: 'esm',
    sourcemap: options.mode === 'dev' ? 'linked' : 'none',
    minify: options.mode === 'prod',
    plugins: [appRoutesVirtualPlugin(clientManifestFile), serverExportsPlugin(dirs.routesDir)],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error('Bun.build failed to bundle the web client entry');
  }

  const entryOut = result.outputs.find((o) => o.kind === 'entry-point' && o.path.endsWith('.js'));
  if (!entryOut) throw new Error('Bun.build produced no JS output for the web client entry');

  const manifest = { 'entry.client.js': path.relative(webDir, entryOut.path) };
  await writeFile(path.join(webDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return { manifest, stop: async () => {} };
}

/** `<script src>` for the client entry — the hashed path from the web manifest, or the dev
 * default. Read by `serve.ts` to hand to `createWebRouter`. */
export async function webEntrySrc(dirs: Dirs): Promise<string> {
  const manifestFile = path.join(dirs.generatedDir, 'web', 'manifest.json');
  if (existsSync(manifestFile)) {
    const manifest = JSON.parse(await Bun.file(manifestFile).text()) as Record<string, string>;
    if (manifest['entry.client.js']) return `/_ratchet/${manifest['entry.client.js']}`;
  }
  return '/_ratchet/entry.client.js';
}
