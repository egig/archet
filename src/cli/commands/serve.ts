import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { App } from '../../router/http-app.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createApiRouter } from '../../router/create-router.js';
import { buildRegistryMap, buildDomainSettingsRegistryMap } from '../../router/registry-map.js';
import { createAuthRouter } from '../../auth/router.js';
import { createAutomationRouter } from '../../automation/router.js';
import { createConsoleRouter } from '../../console/router.js';
import { createSiteAssetsRouter } from '../../router/site-assets.js';
import { createNodeFsAssetSource } from '../../console/node-assets.js';
import { buildStorageAdapter } from '../../core/storage-config.js';
import { loadConfig, resolveDirs } from '../load-config.js';
import { existsSync } from 'node:fs';
import { createWebRouter, createWebAssetsRouter } from '../../web/router.js';
import { webEntrySrc } from '../build-web.js';
import type { RouteObject } from 'react-router';

/**
 * §5/§6: the dynamic `/api/:model` router only needs a registry (name -> ModelDefinition) and a
 * db client — apps never need to hand-write a server entry file. `serve` builds both from
 * ratchet.config.ts and the generated registry, and boots a plain Bun.serve listener.
 */
export async function runServe(cwd: string): Promise<ReturnType<typeof Bun.serve>> {
  const config = await loadConfig(cwd);
  const dirs = resolveDirs(cwd, config);
  const { generatedDir } = dirs;

  const registryFile = path.join(generatedDir, 'registry.ts');
  const registryModule = (await import(pathToFileURL(registryFile).href)) as Record<string, unknown>;
  const registry = buildRegistryMap(registryModule);

  const domainsFile = path.join(generatedDir, 'domains.ts');
  const domainsModule = (await import(pathToFileURL(domainsFile).href)) as Record<string, unknown>;
  const domainSettingsRegistry = buildDomainSettingsRegistryMap(domainsModule);

  // The developer's React Router site — mounted only when opted into (`ratchet generate` wrote
  // `.ratchet/app-routes.server.ts` because `<routesDir>/root.tsx` exists).
  const serverRoutesFile = path.join(generatedDir, 'app-routes.server.ts');
  const webManifest = existsSync(serverRoutesFile)
    ? ((await import(pathToFileURL(serverRoutesFile).href)) as {
        routes: RouteObject[];
        resourceRouteIds: ReadonlySet<string>;
      })
    : null;

  const client = postgres(config.db.connectionString);
  const db = drizzle(client);

  // built from `config.storage` (default: local fs, sibling to `<generatedDir>/console`,
  // gitignored the same way `generatedDir` itself is) — see `buildStorageAdapter`
  // (core/storage-config.ts). A production deploy target without Node/Bun's plain-config
  // resolution (e.g. Cloudflare, whose R2 binding only exists inside a Worker's `fetch` handler)
  // builds its own `FileStorage` and passes it to `createApiRouter` instead — see
  // `example/deploy/cloudflare/worker.ts`.
  const storage = await buildStorageAdapter(config.storage, path.join(generatedDir, 'storage'));

  const app = new App();
  // more specific prefix first: `/api/auth/*` and `/api/automation/*` must win over the generic
  // `/api/:model` pattern, and all three must win over the console router — which is registered
  // next since `consolePath` can be '/' (root mount), where its own catch-all would otherwise
  // swallow every path. The website router (public page rendering) is registered last of all —
  // its own `/:slug` route is a catch-all too, and mounting it last means a page slug that
  // happens to collide with `/api` or the console's mount point always loses to the router
  // already claiming that path (see `website/router.ts`'s own doc comment).
  app.route('/api/auth', createAuthRouter(db));
  app.route('/api/automation', createAutomationRouter(db, registry));
  app.route('/api', createApiRouter(registry, db, storage));
  app.route(
    dirs.consolePath,
    createConsoleRouter(createNodeFsAssetSource(generatedDir), registry, db, dirs.consolePath, domainSettingsRegistry, storage),
  );
  // `/_site-assets/*` — a `field.file({ public: true })` Domain Settings value (e.g. the website
  // Domain's favicon/social share image), served with no auth at all. Fixed, non-configurable
  // prefix (unlike `consolePath`) so a public asset's URL never moves; mounted before the website
  // router below for the same reason `/api`/the console are — that catch-all `/:slug` route must
  // never be able to shadow it.
  app.route('/_site-assets', createSiteAssetsRouter(db, storage, domainSettingsRegistry));

  // The web app, last (its `/*` is a catch-all): built client assets under `/_ratchet`, then the
  // one `/` mount — a `publicDir` static file if the request matches one, else the SSR + `.data`
  // handler (`createWebRouter` folds the `publicDir` lookup in; a second `/` mount would shadow it,
  // see that file). When the site isn't opted into, `/` simply 404s (no Page/Block fallback — see
  // docs/adr/0003).
  if (webManifest) {
    app.route('/_ratchet', createWebAssetsRouter(generatedDir));
    app.route(
      '/',
      createWebRouter({
        routes: webManifest.routes,
        resourceRouteIds: webManifest.resourceRouteIds,
        entrySrc: await webEntrySrc(dirs),
        publicDir: dirs.publicDir,
        db,
        registry,
        domainSettingsRegistry,
        storage,
      }),
    );
  }

  const port = Number(process.env.PORT ?? 3000);
  const server = Bun.serve({ fetch: app.fetch, port });
  console.log(`ratchet listening on http://localhost:${server.port}`);
  console.log(`models: ${Object.keys(registry).join(', ')}`);
  return server;
}
