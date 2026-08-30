# The public site is a code-driven React Router data-mode app, bundled with Bun

Ratchet's `website` domain shipped a DB-backed page builder: `Page`/`Block` models, a console
Page Builder screen, and `render.ts` turning published rows into plain HTML at the `/` catch-all.
That serves a marketing site an operator edits without deploying, but it's a dead end for anything
with real behavior — a route that runs a query, a form that does more than store fields, a layout
composed from components.

We replaced the renderer (not the models) with **`src/web/`**: the developer writes
`routes/**/*.tsx` in a folder convention, and Ratchet scans them at codegen time, server-renders
them, and bundles the client with `Bun.build`. The `website` package stays in the tree, unmounted
— its `WebsiteDomain` settings (site title, favicon, `headHtml`, `globalCss`, …) are still
console-editable and are read by the web app's `routes/root.tsx` loader through the injected
`context`.

## Why data mode, not framework mode

React Router's framework mode (the Remix successor) is a Vite plugin. Ratchet already bundles the
console with `Bun.build` and just hand-rolled its own router to drop Hono — pulling in Vite and
`@react-router/dev` (babel, chokidar, a second build system) contradicts that direction. Data mode
is the lower-level primitive set — `createStaticHandler` / `createStaticRouter` on the server,
`createBrowserRouter` on the client — with no build-tool opinion. We wire it by hand, the same way
`workspace/react-router-bun` does, and own a small folder-convention scanner instead of depending
on `@react-router/fs-routes`.

## Why single fetch

The tension in data-mode SSR is that a loader written to read `context.db` on the server has no
`context` when `createBrowserRouter` re-runs it after a client navigation. The reference project
sidesteps this by having every loader `fetch` a JSON API (self-fetch on the server). We went the
other way: **loaders and actions only ever run on the server**. A client navigation issues one
`GET`/`POST <path>.data` request; the server re-runs the matched loaders with the real `context`
and streams back a turbo-stream payload keyed by route id. This is what framework mode's "single
fetch" does; the cost is a `.data` round trip per navigation and a `Bun.build` transform
(`transform-server-exports.ts`) that strips `loader`/`action`/`headers` — and empties `*.server`
imports — from the browser build so server code never ships.

## What's deliberately deferred

Route-level code splitting (one client bundle in v1), `+types` typegen, `?_routes=` revalidation
filtering, `<Link>` prefetch, `clientLoader`/`clientAction`/`links`, and HMR (a `routes/` edit
triggers a full rebuild + restart). None of these are load-bearing for the sites this initially
targets, and each can be added without a breaking change.
