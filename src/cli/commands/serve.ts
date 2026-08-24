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
import { createAutomationRouter } from '../../automation/router.js';
import { createConsoleRouter } from '../../console/router.js';
import { createNodeFsAssetSource } from '../../console/node-assets.js';
import { loadConfig, resolveDirs } from '../load-config.js';

/**
 * §5/§6: the dynamic `/api/:model` router only needs a registry (name -> ModelDefinition) and a
 * db client — apps never need to hand-write a server entry file. `serve` builds both from
 * ratchet.config.ts and the generated registry, and boots a plain @hono/node-server listener.
 */
export async function runServe(cwd: string): Promise<ServerType> {
  const config = await loadConfig(cwd);
  const dirs = resolveDirs(cwd, config);
  const { generatedDir } = dirs;

  const registryFile = path.join(generatedDir, 'registry.ts');
  const registryModule = (await tsImport(pathToFileURL(registryFile).href, import.meta.url)) as Record<
    string,
    unknown
  >;
  const registry = buildRegistryMap(registryModule);

  const client = postgres(config.db.connectionString);
  const db = drizzle(client);

  const app = new Hono();
  // more specific prefix first: `/api/auth/*` and `/api/chats/*` must win over the generic
  // `/api/:model` pattern, and all three must win over the console router — which is registered
  // last since `consolePath` can be '/' (root mount), where its own catch-all would otherwise
  // swallow every path.
  app.route('/api/auth', createAuthRouter(db));
  app.route('/api/chats', createAutomationRouter(db));
  app.route('/api', createApiRouter(registry, db));
  app.route(dirs.consolePath, createConsoleRouter(createNodeFsAssetSource(generatedDir), registry, db, dirs.consolePath));

  const port = Number(process.env.PORT ?? 3000);
  return serveNode({ fetch: app.fetch, port }, (info) => {
    console.log(`ratchet listening on http://localhost:${info.port}`);
    console.log(`models: ${Object.keys(registry).join(', ')}`);
  });
}
