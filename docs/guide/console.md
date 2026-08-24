# Console

`ratchet serve` mounts a generated console SPA — a sidebar of models, list/form views generated from each model's field metadata, and session-based login, with no per-model UI code to write.

## Where it's mounted

By default the console mounts at `/console`. Set `consolePath` in `ratchet.config.ts` to change that:

```ts
export default defineConfig({
  // ...
  consolePath: '/dashboard', // any path starting with '/', no trailing slash
});
```

`consolePath` can also be `'/'`, which mounts the console as the app's catch-all fallback — the whole app *is* the console, with `/api` and `/api/auth` still reachable at their usual paths (they're registered first, so they keep precedence over the console's own catch-all route). It can't be `/api`, `/api/auth`, or anything starting with `/api/` — those are the framework's own routers.

`consolePath` is baked into the console client bundle at build time (it's used as the client-side router's `basename`), so changing it requires re-running `ratchet build`/`ratchet dev`.

## How it's built

`ratchet build` (or `ratchet dev`, for local iteration) bundles `console/client/main.tsx` with esbuild + Tailwind into hashed assets plus a `manifest.json`, written under `<generatedDir>/console/`. `createConsoleRouter` serves that shell and its assets at `${consolePath}/*`, and falls back to a 503 with an instructive message if the console hasn't been built yet.

Because the SPA uses client-side routing, every path under `consolePath` (not just `consolePath` itself) serves the same HTML shell — a hard refresh on `/console/customers/:id` needs to resolve to the shell too, since routing happens in the browser after it loads.

## Metadata API

The console SPA discovers models and renders CRUD views from a small metadata API, backed by the same registry `/api/:model` uses. It's namespaced under `/meta` (not `/api`) precisely so it never collides with the top-level `/api` router, even when `consolePath` is `'/'`:

| Method | Path | |
|---|---|---|
| `GET` | `${consolePath}/meta/models` | metadata for every non-hidden model |
| `GET` | `${consolePath}/meta/models/:name` | metadata for one model |

Both require an authenticated session (see [Auth](/guide/auth)) and are driven by each model's `fields` and `console` options — there's no separate console schema to maintain.

## Controlling what shows up

Set these under `console` in `defineModel`:

```ts
export const Session = defineModel('sessions', {
  fields: { /* ... */ },
  console: { hidden: true }, // managed only through /api/auth/*, not the console CRUD views
});

export const Customer = defineModel('customers', {
  fields: { /* ... */ },
  console: {
    label: 'Customers',      // sidebar/heading text; defaults to a capitalized model name
    displayField: 'name',    // shown in reference dropdowns and list-view titles; defaults to the first string field, or 'id'
  },
});
```

A `field.reference(...)` on a model automatically renders as a dropdown in the generated form, populated from the target model's rows and labeled with its `displayField`. A field with `sensitive: true` (e.g. `passwordHash`) never round-trips to the client; one with `writeAs` submits under its declared input key instead of its column name; one with `displayText` uses that as its list/form label instead of a humanized field key (see [Common options](/guide/models#common-options)).
