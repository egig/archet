/**
 * `@egig/ratchet/web` — the client-safe surface of the web app package (the developer's React
 * Router data-mode site). Imported by `routes/root.tsx` and by the generated route manifests.
 * Server-only assembly (`createWebRouter`, the SSR handler) lives in `./router.js` /
 * `./server.js`, imported by `cli/commands/serve.ts` directly and, for the bundled `dist/server.js`
 * artifact, via the separate `@egig/ratchet/web/router` export — never re-exported here, so a
 * route module can import from `@egig/ratchet/web` without pulling `db`/`react-dom/server` into
 * the browser bundle.
 */
export { Meta, Scripts, DocumentContext } from './document.js';
export type { MetaFunction, MetaDescriptor, RouteHandle } from './document.js';
export { getWebContext } from './context.js';
export type { WebLoaderContext, WebSession } from './context.js';
export { DefaultRootErrorBoundary } from './error-boundary.js';
export { singleFetchHandler, dataPathname, createSingleFetchDataStrategy } from './single-fetch.js';
