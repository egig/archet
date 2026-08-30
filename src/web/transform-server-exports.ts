import path from 'node:path';
import { SERVER_ONLY_EXPORTS } from './scan-routes.js';

/**
 * Keeps server code out of the browser bundle (docs/adr/0003). Two mechanisms, both applied by
 * `serverExportsPlugin` during `Bun.build` of the web client:
 *
 *  1. `onLoad` over every route module: `loader` / `action` / `headers` exports are eliminated and
 *     any import left with no remaining references is trimmed. So a route file can freely mix a
 *     server `loader` with its client `Component` — the browser build only ever sees the client
 *     half. (The generated client manifest never imports `loader`/`action` from a route module
 *     anyway — it wires single-fetch sentinels — so this is purely about the route file's own
 *     top-level imports.)
 *
 *  2. `onResolve` over any `*.server` / `*.server.{ts,tsx,js,jsx}` specifier, anywhere in the
 *     graph: resolved to an empty module. `trimUnusedImports` downgrades a now-unused
 *     `import { db } from './db.server'` to a bare `import './db.server'` (it can't prove the
 *     module is side-effect free); this makes that bare import evaporate. Side-effectful
 *     server-only modules (a drizzle client, anything touching `node:*`) must therefore be named
 *     `*.server.*` — the same convention React Router uses.
 */

const ROUTE_FILE_RE = /\.(tsx|ts|jsx|js)$/;
const SERVER_MODULE_RE = /\.server(\.(tsx|ts|jsx|js))?$/;

/** Strip `loader`/`action`/`headers` (and their now-dead imports) from a route module's source. */
export function stripServerExports(source: string, loader: 'tsx' | 'ts' | 'jsx' | 'js' = 'tsx'): string {
  const transpiler = new Bun.Transpiler({
    loader,
    target: 'browser',
    exports: { eliminate: [...SERVER_ONLY_EXPORTS] },
    trimUnusedImports: true,
  });
  return transpiler.transformSync(source);
}

export function serverExportsPlugin(routesDir: string): Bun.BunPlugin {
  const routesPrefix = routesDir.endsWith(path.sep) ? routesDir : routesDir + path.sep;
  return {
    name: 'ratchet-web-server-exports',
    setup(build) {
      build.onResolve({ filter: SERVER_MODULE_RE }, (args) => {
        void args;
        return { path: 'ratchet-empty-server-module', namespace: 'ratchet-empty' };
      });
      build.onLoad({ filter: /.*/, namespace: 'ratchet-empty' }, () => ({ contents: 'export {};', loader: 'js' }));

      build.onLoad({ filter: ROUTE_FILE_RE }, async (args) => {
        if (!args.path.startsWith(routesPrefix)) return undefined;
        const source = await Bun.file(args.path).text();
        const ext = (args.path.match(ROUTE_FILE_RE)?.[1] ?? 'tsx') as 'tsx' | 'ts' | 'jsx' | 'js';
        return { contents: stripServerExports(source, ext), loader: ext };
      });
    },
  };
}
