import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve as serveNode, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { tsImport } from 'tsx/esm/api';
import { createApiRouter } from '../../router/create-router.js';
import { buildRegistryMap } from '../../router/registry-map.js';
import { createAuthRouter } from '../../auth/router.js';
import { createAdminRouter } from '../../admin/router.js';
import { loadConfig, resolveDirs } from '../load-config.js';

/**
 * §5/§6: the dynamic `/api/:model` router only needs a registry (name -> ModelDefinition) and a
 * db client — apps never need to hand-write a server entry file. `serve` builds both from
 * archet.config.ts and the generated registry, and boots a plain @hono/node-server listener.
 */
export async function runServe(cwd: string): Promise<ServerType> {
  const config = await loadConfig(cwd);
  const { generatedDir } = resolveDirs(cwd, config);

  const registryFile = path.join(generatedDir, 'registry.ts');
  const registryModule = (await tsImport(pathToFileURL(registryFile).href, import.meta.url)) as Record<
    string,
    unknown
  >;
  const registry = buildRegistryMap(registryModule);

  const client = postgres(config.db.connectionString);
  const db = drizzle(client);

  const app = new Hono();
  app.route('/admin', createAdminRouter(generatedDir));
  // more specific prefix first: `/api/auth/*` must win over the generic `/api/:model` pattern.
  app.route('/api/auth', createAuthRouter(db));
  app.route('/api', createApiRouter(registry, db));

  const port = Number(process.env.PORT ?? 3000);
  return serveNode({ fetch: app.fetch, port }, (info) => {
    console.log(`archet listening on http://localhost:${info.port}`);
    console.log(`models: ${Object.keys(registry).join(', ')}`);
  });
}
