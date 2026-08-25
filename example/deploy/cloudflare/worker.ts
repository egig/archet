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
 * File storage: `env.FILES` is a native R2 bucket binding (wrangler.jsonc's `r2_buckets`) —
 * `createR2StorageAdapter` below adapts it to ratchet's `FileStorageAdapter` the same way
 * `createAssetsBindingSource` adapts `env.ASSETS`. Neither uses `FrameworkConfig` for this: R2's
 * binding only exists inside a Worker's `fetch` handler, so it can't be resolved from a plain
 * config value the way `db.connectionString` can (see `FileStorageAdapter`'s doc comment,
 * `@egig/ratchet/core`) — this file constructs and injects the concrete adapter itself.
 *
 * The literal `'/console'` below must match `consolePath` in `ratchet.config.ts` if you've
 * customized it (see docs/guide/console.md) — ratchet doesn't patch this file for you.
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createApiRouter, buildRegistryMap } from '@egig/ratchet/router';
import { createAuthRouter } from '@egig/ratchet/auth';
import { createConsoleRouter, type ConsoleAsset, type ConsoleAssetSource, type ConsoleManifest } from '@egig/ratchet/console';
import type { FileStorageAdapter } from '@egig/ratchet/core';
import * as registryModule from '../../.ratchet/registry.js';

const CONSOLE_PATH = '/console';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

interface Env {
  HYPERDRIVE: { connectionString: string };
  ASSETS: AssetsBinding;
  FILES: R2Bucket;
}

function createR2StorageAdapter(bucket: R2Bucket): FileStorageAdapter {
  return {
    async put(key, data, opts) {
      await bucket.put(key, data, { httpMetadata: { contentType: opts.mimeType } });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return { data: new Uint8Array(await obj.arrayBuffer()), mimeType: obj.httpMetadata?.contentType ?? 'application/octet-stream' };
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
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
    app.route('/api', createApiRouter(registry, db, createR2StorageAdapter(env.FILES)));
    app.route(CONSOLE_PATH, createConsoleRouter(createAssetsBindingSource(env.ASSETS), registry, db, CONSOLE_PATH));

    return app.fetch(request);
  },
};
