/**
 * Cloudflare Worker entry point — mounts the same `/api`, `/api/auth`, and `/admin` routes as
 * `ratchet serve`, on Cloudflare's edge network. This is a user-owned entry file, not something
 * `ratchet build` generates (see docs/guide/deploy.md) — deploy it yourself with `wrangler deploy`,
 * after `ratchet build` has produced `.ratchet/registry.ts` and `.ratchet/admin/`.
 *
 * DB: postgres.js through a Hyperdrive binding, Cloudflare's documented way to reach a regular TCP
 * Postgres from a Worker (Hyperdrive pools upstream, so a fresh client per request is the
 * recommended, cheap pattern — see wrangler.jsonc's `hyperdrive` binding and `compatibility_flags:
 * ["nodejs_compat"]`).
 *
 * Admin assets: Cloudflare Workers Static Assets (wrangler.jsonc's `assets` field, pointed at
 * `.ratchet/admin`) serves the built JS/CSS/manifest straight off Cloudflare's CDN — `env.ASSETS`
 * below just adapts that binding to ratchet's `AdminAssetSource` interface.
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createApiRouter, buildRegistryMap } from 'ratchet/router';
import { createAuthRouter } from 'ratchet/auth';
import { createAdminRouter, type AdminAsset, type AdminAssetSource, type AdminManifest } from 'ratchet/admin';
import * as registryModule from '../../.ratchet/registry.js';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  HYPERDRIVE: { connectionString: string };
  ASSETS: AssetsBinding;
}

/** `directory` in wrangler.jsonc points straight at `.ratchet/admin`, so paths here are relative
 * to that (no `/admin` prefix) — `manifest.json` at the root, assets under `/assets/`. */
function createAssetsBindingSource(assets: AssetsBinding): AdminAssetSource {
  return {
    async getManifest(): Promise<AdminManifest | null> {
      const res = await assets.fetch(new Request('https://assets.local/manifest.json'));
      if (!res.ok) return null;
      return (await res.json()) as AdminManifest;
    },
    async getAsset(assetPath: string): Promise<AdminAsset | null> {
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

    const app = new Hono();
    app.route('/admin', createAdminRouter(createAssetsBindingSource(env.ASSETS), registry, db));
    app.route('/api/auth', createAuthRouter(db));
    app.route('/api', createApiRouter(registry, db));

    return app.fetch(request);
  },
};
