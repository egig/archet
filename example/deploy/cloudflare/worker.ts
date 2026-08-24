/**
 * Cloudflare Worker entry point — mounts the same `/api`, `/api/auth`, and console (`/console` by
 * default — see `ratchet.config.ts`'s `consolePath`) routes as `ratchet serve`, on Cloudflare's
 * edge network. This is a user-owned entry file, not something `ratchet build` generates (see
 * docs/guide/deploy.md) — deploy it yourself with `wrangler deploy`, after `ratchet build` has
 * produced `.ratchet/registry.ts` and `.ratchet/console/`.
 *
 * DB: postgres.js through a Hyperdrive binding, Cloudflare's documented way to reach a regular TCP
 * Postgres from a Worker (Hyperdrive pools upstream, so a fresh client per request is the
 * recommended, cheap pattern — see wrangler.jsonc's `hyperdrive` binding and `compatibility_flags:
 * ["nodejs_compat"]`).
 *
 * Console assets: Cloudflare Workers Static Assets (wrangler.jsonc's `assets` field, pointed at
 * `.ratchet/console`) serves the built JS/CSS/manifest straight off Cloudflare's CDN — `env.ASSETS`
 * below just adapts that binding to ratchet's `ConsoleAssetSource` interface.
 *
 * The literal `'/console'` below must match `consolePath` in `ratchet.config.ts` if you've
 * customized it (see docs/guide/console.md) — ratchet doesn't patch this file for you.
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createApiRouter, buildRegistryMap } from 'ratchet/router';
import { createAuthRouter } from 'ratchet/auth';
import { createConsoleRouter, type ConsoleAsset, type ConsoleAssetSource, type ConsoleManifest } from 'ratchet/console';
import * as registryModule from '../../.ratchet/registry.js';

const CONSOLE_PATH = '/console';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  HYPERDRIVE: { connectionString: string };
  ASSETS: AssetsBinding;
}

/** `directory` in wrangler.jsonc points straight at `.ratchet/console`, so paths here are
 * relative to that (no console-path prefix) — `manifest.json` at the root, assets under `/assets/`. */
function createAssetsBindingSource(assets: AssetsBinding): ConsoleAssetSource {
  return {
    async getManifest(): Promise<ConsoleManifest | null> {
      const res = await assets.fetch(new Request('https://assets.local/manifest.json'));
      if (!res.ok) return null;
      return (await res.json()) as ConsoleManifest;
    },
    async getAsset(assetPath: string): Promise<ConsoleAsset | null> {
      const res = await assets.fetch(new Request(`https://assets.local/assets/${assetPath}`));
      if (!res.ok) return null;
      return {
        body: await res.arrayBuffer(),
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      };
    },
  };
}

const registry = buildRegistryMap(registryModule as Record<string, unknown>);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Hyperdrive pools upstream — a fresh client per request is Cloudflare's documented, cheap
    // pattern here, not a mistake. `fetch_types: false` skips a pg_catalog round-trip ratchet's
    // generated schema doesn't need (no array-typed columns).
    const client = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
    const db = drizzle(client);

    // `/api/auth` and `/api` are registered before the console router so they keep precedence if
    // `CONSOLE_PATH` is ever set to '/' (root mount) — its own catch-all would otherwise swallow
    // every path (see `FrameworkConfig.consolePath`).
    const app = new Hono();
    app.route('/api/auth', createAuthRouter(db));
    app.route('/api', createApiRouter(registry, db));
    app.route(CONSOLE_PATH, createConsoleRouter(createAssetsBindingSource(env.ASSETS), registry, db, CONSOLE_PATH));

    return app.fetch(request);
  },
};
