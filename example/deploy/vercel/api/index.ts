/**
 * Vercel Function entry point — mounts the same `/api` and `/api/auth` routes as `ratchet serve`.
 * `vercel.json`'s rewrites route every `/api/*` request here (one catch-all function, not a file
 * per model/route) — see docs/guide/deploy.md.
 *
 * Vercel Functions default to a Node.js runtime (full TCP — the same postgres.js driver as local
 * dev/the VPS bundle would work here too), but each invocation is still a short-lived serverless
 * instance. A plain `postgres()` client per invocation can exhaust your Postgres's max_connections
 * once you have real concurrent traffic. This example uses Neon's HTTP driver instead — no
 * persistent connection, scales with invocation count for free. Swap in your own provider's
 * pooled connection string (and `drizzle-orm/postgres-js`) if you're not on Neon and your provider
 * already pools for you.
 *
 * The console is intentionally not mounted here: Vercel serves static files under `public/`
 * straight from its CDN, with no function invocation at all, which is a better fit for the
 * console SPA's built assets than routing them through this function — see `vercel.json` / deploy.md.
 *
 * File storage: unlike Cloudflare's R2 binding (only reachable inside a Worker's `fetch`
 * handler), a Vercel Function is a regular Node process — credentials for a well-known backend
 * resolve from plain env vars at cold start, same as `db.connectionString` above. `buildStorageAdapter`
 * (`@egig/ratchet/storage`) is the same config-driven builder `ratchet serve` uses; S3 is shown
 * here, but any driver in `StorageConfig` (`@egig/ratchet/core`) works. Requires installing the
 * chosen driver's peer dependencies yourself (`@flystorage/aws-s3` + `@aws-sdk/client-s3` for
 * `driver: 's3'`) — only the one you pick, not every cloud SDK.
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { createApiRouter, buildRegistryMap } from '@egig/ratchet/router';
import { createAuthRouter } from '@egig/ratchet/auth';
import { buildStorageAdapter } from '@egig/ratchet/storage';
import * as registryModule from '../../../.ratchet/registry.js';

const registry = buildRegistryMap(registryModule as Record<string, unknown>);
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const storage = await buildStorageAdapter(
  {
    driver: 's3',
    bucket: process.env.S3_BUCKET!,
    region: process.env.S3_REGION,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  },
  '', // no local-fs fallback dir needed — this config never falls back to `driver: 'local'`
);

const app = new Hono();
app.route('/api/auth', createAuthRouter(db));
app.route('/api', createApiRouter(registry, db, storage));

// A Hono app's own `.fetch` matches Vercel's "fetch Web Standard" function export convention
// directly — no adapter needed.
export default app;
