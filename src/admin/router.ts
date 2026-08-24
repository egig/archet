import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { Hono, type Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition } from '../core/model.js';
import { PipelineError } from '../core/pipeline.js';
import { resolveSessionUser } from '../auth/pipeline.js';
import { toErrorResponse } from '../router/errors.js';
import { serializeModelMeta } from './serialize-model.js';

type AnyDb = PgDatabase<any, any, any>;

interface AdminManifest {
  'main.js': string;
  'main.css'?: string;
}

function loadManifest(generatedDir: string): AdminManifest | null {
  const manifestFile = path.join(generatedDir, 'admin', 'manifest.json');
  if (!existsSync(manifestFile)) return null;
  return JSON.parse(readFileSync(manifestFile, 'utf8')) as AdminManifest;
}

function renderShell(manifest: AdminManifest): string {
  // absolute (`/admin/...`), not relative (`./...`) — a relative URL resolves against the
  // *current path*, so it broke on every route without a trailing slash (`/admin`,
  // `/admin/customers/:id`, ...) once the SPA got real sub-routes: `./assets/main.js` from
  // `/admin/customers` resolves to `/admin/assets/main.js` by luck, but from bare `/admin` it
  // resolves to `/assets/main.js` at the *site* root, 404ing every asset.
  const css = manifest['main.css'] ? `<link rel="stylesheet" href="/admin/${manifest['main.css']}">` : '';
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Ratchet admin</title>',
    css,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script type="module" src="/admin/${manifest['main.js']}"></script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function serveShell(generatedDir: string) {
  return (c: Context) => {
    const manifest = loadManifest(generatedDir);
    if (!manifest) {
      return c.text(
        'admin UI not built yet — run `ratchet build` or `ratchet dev` (requires an admin/client/main.tsx entry)',
        503,
      );
    }
    return c.html(renderShell(manifest));
  };
}

/** `/admin/*` — serves the admin UI shell + its built assets (resolved via the manifest
 * `ratchet build`/`ratchet dev` write to `<generatedDir>/admin/manifest.json`, see
 * src/cli/build-admin.ts), plus a small `/admin/api/models[/:name]` metadata API the admin SPA
 * uses to render its sidebar and dynamically-generated CRUD views — driven by the same registry
 * map `createApiRouter` (src/router/create-router.ts) uses for `/api/:model`, so the two never
 * drift. Mirrors src/auth/router.ts's `createXRouter(...) -> Hono` shape. */
export function createAdminRouter(generatedDir: string, registry: Record<string, ModelDefinition>, db: AnyDb): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as never);
  });

  app.get('/api/models', async (c) => {
    await resolveSessionUser(db, c.req.raw);
    const models = Object.values(registry)
      .filter((model) => !model.admin?.hidden)
      .map(serializeModelMeta);
    return c.json({ data: models });
  });

  app.get('/api/models/:name', async (c) => {
    await resolveSessionUser(db, c.req.raw);
    const model = registry[c.req.param('name')];
    if (!model || model.admin?.hidden) throw new PipelineError({ code: 'MODEL_NOT_FOUND', status: 404 });
    return c.json({ data: serializeModelMeta(model) });
  });

  app.use(
    '/assets/*',
    serveStatic({
      root: path.relative(process.cwd(), path.join(generatedDir, 'admin')),
      // `app.route('/admin', ...)` in serve.ts prefixes matching but not `c.req.path` — strip it
      // ourselves so `root` + rewritten path lands on `<generatedDir>/admin/assets/...`.
      rewriteRequestPath: (p) => p.replace(/^\/admin/, ''),
    }),
  );

  // catch-all, not just `/`: the SPA uses react-router's BrowserRouter (client-side, path-based
  // routes like `/admin/customers/:id`), so a hard refresh/deep link on any of those paths must
  // still resolve to the same shell — routing itself happens in the browser after it loads.
  app.get('/*', serveShell(generatedDir));

  return app;
}
