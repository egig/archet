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
| `GET` | `${consolePath}/meta/domains` | metadata for every Domain that has Domain Settings |
| `GET` | `${consolePath}/meta/domains/:name/settings` | one Domain's current settings values |
| `PATCH` | `${consolePath}/meta/domains/:name/settings` | update one Domain's settings values |

All require an authenticated session (see [Auth](/guide/auth)) and are driven by each model's `fields`/`console` options or a Domain's `defineDomain()` — there's no separate console schema to maintain.

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

## Domains

A **Domain** groups related models — declare a model inside a top-level subdirectory of `modelsDir` and it belongs to that Domain:

```
models/
  auth/
    user.model.ts       # domain: 'auth'
    settings.domain.ts  # this Domain's settings, below
  billing/
    invoice.model.ts    # domain: 'billing'
  customer.model.ts     # no domain — declared at modelsDir's root
```

The console sidebar groups a Domain's models under one labeled section, instead of listing every model flat. A model declared directly under `modelsDir`, with no subdirectory, has no Domain and stays outside any section.

### Domains

A Domain can also declare a display label, typed, DB-backed, console-editable settings, and extra console sidebar links, with `defineDomain()`. Add a `*.domain.ts` file under the same subdirectory as the Domain's models:

```ts
// models/auth/settings.domain.ts
import { defineDomain, field } from '@egig/ratchet/core';

export const AuthSettings = defineDomain('auth', {
  label: 'Authentication',           // settings-page heading; defaults to a capitalized domain name
  settings: {
    sessionTtlDays: field.integer({ default: 7 }),
    requireMfa: field.boolean({ default: false }),
  },
  consoleMenu: [
    // extra sidebar links rendered above this Domain's models — for a page with no model of its
    // own to derive a link from.
    { label: 'Audit log', to: '/auth/audit-log' },
  ],
});
```

The `name` argument (`'auth'` above) must match the folder it's declared in (`ratchet generate` rejects a mismatch). `settings` and `consoleMenu` are both optional — declare either, both, or (rarely) neither.

The sidebar shows one "Settings" link (only once at least one Domain declares `settings`) opening `${consolePath}/settings`, a single page that tabs across every Domain that has settings — `${consolePath}/settings/:domain` selects a tab directly, and `/settings` itself redirects to the first one. Each tab is a form generated from that Domain's `settings` the same way a model's form is.

Read a Domain's current settings from a pipeline function:

```ts
import { getDomainSettings } from '@egig/ratchet/core';
import { AuthSettings } from '../models/auth/settings.domain.js';

const settings = await getDomainSettings(ctx.db, AuthSettings); // { sessionTtlDays, requireMfa }
```

## Extending the console

`console/client/main.tsx` lives in your app, not the framework, so it's the place to customize the console — pass `brand` and/or `pages` to `<ConsoleApp />`:

```tsx
import { createRoot } from 'react-dom/client';
import { ConsoleApp } from '@egig/ratchet/console/client';
import { SalesReport } from './SalesReport.js';

const root = document.getElementById('root')!;
createRoot(root).render(
  <ConsoleApp
    brand={{ name: 'Acme Admin', logo: <img src="/logo.svg" className="h-6 w-6" /> }}
    pages={[{ path: 'reports/sales', label: 'Sales report', element: <SalesReport /> }]}
  />,
);
```

- `brand.name` / `brand.logo` replace the sidebar's default "Ratchet console" heading.
- `pages` adds sidebar links and routes (mounted under `consolePath`, alongside the generated model pages) for arbitrary components you write yourself — each page renders inside the authenticated `Layout`, so it gets the same sidebar and session as the generated views. `path` is relative (e.g. `'reports/sales'`, not `/reports/sales`).
