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
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { createApiRouter, buildRegistryMap } from '@egig/ratchet/router';
import { createAuthRouter } from '@egig/ratchet/auth';
import * as registryModule from '../../../.ratchet/registry.js';

const registry = buildRegistryMap(registryModule as Record<string, unknown>);
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const app = new Hono();
app.route('/api/auth', createAuthRouter(db));
app.route('/api', createApiRouter(registry, db));

// A Hono app's own `.fetch` matches Vercel's "fetch Web Standard" function export convention
// directly — no adapter needed.
export default app;
