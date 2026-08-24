# Deploying

`ratchet serve` and the bundle from `ratchet build` are Node — that covers local development and any VPS/container host. Beyond that, `/api`, `/api/auth`, and `/admin` are built as plain [Hono](https://hono.dev) routers that take a `db` and a `registry` as arguments rather than constructing them internally, so they run on any runtime Hono supports. Nothing in `ratchet build`/`ratchet generate`/`ratchet migrate` targets those runtimes — they stay Node-only dev tooling. Deploying to one is a thin entry file you own, composing `createApiRouter`/`createAuthRouter`/`createAdminRouter` yourself with a driver and asset source that fit the target.

## Local development

```sh
PORT=3000 DATABASE_URL=postgres://... ratchet serve
```

Nothing else to configure — see [CLI Reference](/guide/cli).

## VPS / container

`ratchet build` bundles a Node server entry to `dist/server.js` (postgres.js + `@hono/node-server`, admin assets read straight off disk). Ship that file, `.ratchet/`, and a `DATABASE_URL`:

```sh
ratchet build
DATABASE_URL=postgres://... PORT=3000 node dist/server.js
```

Same code path as `ratchet serve`, just without `tsx`/dev tooling at runtime.

## Vercel

Vercel Functions default to a Node.js runtime — the same postgres.js driver as above would work unmodified. But every invocation is still a short-lived serverless instance, and a plain `postgres()` client per invocation can exhaust your database's `max_connections` once there's real concurrent traffic. The [example entry](https://github.com/egig/ratchet/tree/main/example/deploy/vercel) uses Neon's HTTP driver instead (`drizzle-orm/neon-http` + `@neondatabase/serverless`), which needs no persistent connection — swap in your own provider's pooled connection string if you're not on Neon and it already pools for you.

```ts
// api/index.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { createApiRouter, buildRegistryMap } from 'ratchet/router';
import { createAuthRouter } from 'ratchet/auth';
import * as registryModule from '../.ratchet/registry.js';

const registry = buildRegistryMap(registryModule as Record<string, unknown>);
const db = drizzle(neon(process.env.DATABASE_URL!));

const app = new Hono();
app.route('/api/auth', createAuthRouter(db));
app.route('/api', createApiRouter(registry, db));

export default app; // a Hono app's own `.fetch` matches Vercel's fetch-export convention directly
```

```json
// vercel.json — funnels every /api/* request to the one function above
{ "rewrites": [{ "source": "/api/:path*", "destination": "/api" }] }
```

`/admin` isn't mounted here. Copy `.ratchet/admin`'s built output into `public/admin` as part of your build step and let Vercel's CDN serve it directly — no function invocation, and it sidesteps needing an `AdminAssetSource` for Vercel at all.

## Cloudflare Workers

Two pieces Workers don't give you for free: a TCP path to Postgres, and a filesystem for the admin UI's built assets.

**Database** — [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) plus postgres.js, Cloudflare's documented pattern: Hyperdrive pools the upstream connection, so creating a fresh client per request is cheap and expected, not a mistake.

```ts
const client = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
const db = drizzle(client);
```

Requires `compatibility_flags: ["nodejs_compat"]` and a `hyperdrive` binding in `wrangler.jsonc`.

**Admin assets** — [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) serves `.ratchet/admin` straight from Cloudflare's CDN. `createAdminRouter`'s asset source is a small interface (`getManifest()`, `getAsset(path)`), so adapting the `env.ASSETS` binding to it is a few lines:

```ts
function createAssetsBindingSource(assets: { fetch(r: Request): Promise<Response> }): AdminAssetSource {
  return {
    async getManifest() {
      const res = await assets.fetch(new Request('https://assets.local/manifest.json'));
      return res.ok ? await res.json() : null;
    },
    async getAsset(assetPath) {
      const res = await assets.fetch(new Request(`https://assets.local/assets/${assetPath}`));
      if (!res.ok) return null;
      return { body: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
    },
  };
}
```

Full worker + `wrangler.jsonc` in the [example](https://github.com/egig/ratchet/tree/main/example/deploy/cloudflare).