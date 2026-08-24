import { Hono, type Context } from 'hono';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition } from '../core/model.js';
import { PipelineError } from '../core/pipeline.js';
import { resolveSessionUser } from '../auth/pipeline.js';
import { toErrorResponse } from '../router/errors.js';
import { serializeModelMeta } from './serialize-model.js';

type AnyDb = PgDatabase<any, any, any>;

export interface ConsoleManifest {
  'main.js': string;
  'main.css'?: string;
}

export interface ConsoleAsset {
  body: BodyInit;
  contentType: string;
}

/** Lets `createConsoleRouter` serve the console SPA's shell and built assets without assuming a
 * local filesystem — Node's default (`ratchet/console/node`) reads `<generatedDir>/console` off
 * disk; an edge deploy supplies its own (a platform assets binding, KV/R2, bundled imports, ...). */
export interface ConsoleAssetSource {
  getManifest(): Promise<ConsoleManifest | null>;
  getAsset(assetPath: string): Promise<ConsoleAsset | null>;
}

/** `mountPath` is wherever the caller mounted this router (see e.g. src/cli/commands/serve.ts) —
 * absolute (`${mountPath}/...`), not relative (`./...`), asset URLs: a relative URL resolves
 * against the *current path*, so it broke on every route without a trailing slash once the SPA
 * got real sub-routes (`./assets/main.js` from a nested route resolves relative to that route,
 * not the shell's own path, 404ing every asset). */
function renderShell(manifest: ConsoleManifest, mountPath: string): string {
  const prefix = mountPath === '/' ? '' : mountPath;
  const css = manifest['main.css'] ? `<link rel="stylesheet" href="${prefix}/${manifest['main.css']}">` : '';
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Ratchet console</title>',
    css,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script type="module" src="${prefix}/${manifest['main.js']}"></script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function serveShell(assetSource: ConsoleAssetSource, mountPath: string) {
  return async (c: Context) => {
    const manifest = await assetSource.getManifest();
    if (!manifest) {
      return c.text(
        'console UI not built yet — run `ratchet build` or `ratchet dev` (requires a console/client/main.tsx entry)',
        503,
      );
    }
    return c.html(renderShell(manifest, mountPath));
  };
}

/** `app.route(mountPath, ...)` prefixes route *matching* but doesn't rewrite `c.req.path` — strip
 * the prefix ourselves so what we hand `assetSource` is the path relative to `${mountPath}/assets/`,
 * regardless of where this router got mounted. */
function assetPathFrom(c: Context, mountPath: string): string {
  const rest = mountPath === '/' ? c.req.path : c.req.path.slice(mountPath.length);
  return rest.replace(/^\/assets\//, '');
}

/** `${mountPath}/*` — serves the console UI shell + its built assets (resolved via `assetSource`,
 * see `ConsoleAssetSource` above), plus a small `/meta/models[/:name]` metadata API the console
 * SPA uses to render its sidebar and dynamically-generated CRUD views — driven by the same
 * registry map `createApiRouter` (src/router/create-router.ts) uses for `/api/:model`, so the two
 * never drift. Deliberately namespaced under `/meta` rather than `/api` so it never collides with
 * the top-level `/api` router even when `mountPath` is '/' (root mount). Mirrors
 * src/auth/router.ts's `createXRouter(...) -> Hono` shape.
 *
 * `mountPath` must match wherever the caller actually mounts the returned router — it's only used
 * to compute absolute asset URLs and strip the matched prefix back off `c.req.path`, since Hono's
 * `.route()` doesn't rewrite `c.req.path` itself. */
export function createConsoleRouter(
  assetSource: ConsoleAssetSource,
  registry: Record<string, ModelDefinition>,
  db: AnyDb,
  mountPath: string,
): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as never);
  });

  app.get('/meta/models', async (c) => {
    await resolveSessionUser(db, c.req.raw);
    const models = Object.values(registry)
      .filter((model) => !model.console?.hidden)
      .map(serializeModelMeta);
    return c.json({ data: models });
  });

  app.get('/meta/models/:name', async (c) => {
    await resolveSessionUser(db, c.req.raw);
    const model = registry[c.req.param('name')];
    if (!model || model.console?.hidden) throw new PipelineError({ code: 'MODEL_NOT_FOUND', status: 404 });
    return c.json({ data: serializeModelMeta(model) });
  });

  app.get('/assets/*', async (c) => {
    const asset = await assetSource.getAsset(assetPathFrom(c, mountPath));
    if (!asset) return c.notFound();
    return new Response(asset.body, { headers: { 'content-type': asset.contentType } });
  });

  // catch-all, not just `/`: the SPA uses react-router's BrowserRouter (client-side, path-based
  // routes like `${mountPath}/customers/:id`), so a hard refresh/deep link on any of those paths
  // must still resolve to the same shell — routing itself happens in the browser after it loads.
  app.get('/*', serveShell(assetSource, mountPath));

  return app;
}
