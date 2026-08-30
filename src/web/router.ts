import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RouteObject } from 'react-router';
import { App } from '../router/http-app.js';
import { getMimeType } from '../router/mime.js';
import { createWebServer } from './server.js';
import type { BuildWebContextDeps } from './context.js';

/**
 * The web app's three mounts (wired by `cli/commands/serve.ts`, docs/adr/0003):
 *
 *   /_ratchet/*   `createWebAssetsRouter` — the built client bundle + its chunks/sourcemaps
 *   /*            `createPublicAssetsRouter` — files from `publicDir` (favicon.ico, robots.txt…)
 *   /*            `createWebRouter` — the SSR catch-all + `.data` endpoint
 *
 * Mounted after `/api/*`, the console, and `/_site-assets` — its `/*` is a catch-all, so anything
 * a more specific router already claims never reaches it (see `serve.ts`).
 */

async function serveFileUnder(root: string, relPath: string, cacheControl: string): Promise<Response | null> {
  // defend against `..` traversal — the resolved path must stay under `root`
  const resolved = path.resolve(root, '.' + path.posix.normalize('/' + relPath));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  if (!existsSync(resolved)) return null;
  const body = await readFile(resolved);
  return new Response(body, {
    headers: { 'content-type': getMimeType(resolved) ?? 'application/octet-stream', 'cache-control': cacheControl },
  });
}

/** `<generatedDir>/web/assets/*` served at `/_ratchet/*` (hashed filenames in prod → immutable). */
export function createWebAssetsRouter(generatedDir: string): App {
  const assetsDir = path.join(generatedDir, 'web', 'assets');
  const app = new App();
  app.get('/*', async (c) => {
    const rel = c.req.path.replace(/^\/_ratchet\//, '');
    const res = await serveFileUnder(assetsDir, rel, 'public, max-age=31536000, immutable');
    return res ?? c.notFound();
  });
  return app;
}

/** `publicDir/*` served at `/` — before the SSR catch-all. */
export function createPublicAssetsRouter(publicDir: string): App {
  const app = new App();
  app.get('/*', async (c) => {
    if (!existsSync(publicDir)) return c.notFound();
    const res = await serveFileUnder(publicDir, c.req.path, 'public, max-age=3600');
    return res ?? c.notFound();
  });
  return app;
}

export interface CreateWebRouterOptions extends BuildWebContextDeps {
  routes: RouteObject[];
  /** `<script src>` for the client entry — hashed path from the web manifest, or the dev default */
  entrySrc: string;
  /** resource-route ids (from the generated server manifest) — their loader's raw Response is returned */
  resourceRouteIds?: ReadonlySet<string>;
}

export function createWebRouter(opts: CreateWebRouterOptions): App {
  const server = createWebServer(opts.routes, opts, opts.entrySrc, opts.resourceRouteIds);
  const app = new App();
  app.get('/*', (c) => server.handle(c.req.raw));
  app.post('/*', (c) => server.handle(c.req.raw));
  return app;
}
