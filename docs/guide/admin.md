# Admin Panel

`archet serve` mounts a generated admin SPA at `/admin` — a sidebar of models, list/form views generated from each model's field metadata, and session-based login, with no per-model UI code to write.

## How it's built

`archet build` (or `archet dev`, for local iteration) bundles `admin/client/main.tsx` with esbuild + Tailwind into hashed assets plus a `manifest.json`, written under `<generatedDir>/admin/`. `createAdminRouter` serves that shell and its assets at `/admin/*`, and falls back to a 503 with an instructive message if the admin hasn't been built yet.

Because the SPA uses client-side routing, every path under `/admin` (not just `/admin` itself) serves the same HTML shell — a hard refresh on `/admin/customers/:id` needs to resolve to the shell too, since routing happens in the browser after it loads.

## Metadata API

The admin SPA discovers models and renders CRUD views from a small metadata API, backed by the same registry `/api/:model` uses:

| Method | Path | |
|---|---|---|
| `GET` | `/admin/api/models` | metadata for every non-hidden model |
| `GET` | `/admin/api/models/:name` | metadata for one model |

Both require an authenticated session (see [Auth](/guide/auth)) and are driven by each model's `fields` and `admin` options — there's no separate admin schema to maintain.

## Controlling what shows up

Set these under `admin` in `defineModel`:

```ts
export const Session = defineModel('sessions', {
  fields: { /* ... */ },
  admin: { hidden: true }, // managed only through /api/auth/*, not the admin CRUD views
});

export const Customer = defineModel('customers', {
  fields: { /* ... */ },
  admin: {
    label: 'Customers',      // sidebar/heading text; defaults to a capitalized model name
    displayField: 'name',    // shown in reference dropdowns and list-view titles; defaults to 'id'
  },
});
```

A `field.reference(...)` on a model automatically renders as a dropdown in the generated form, populated from the target model's rows and labeled with its `displayField`. A field with `sensitive: true` (e.g. `passwordHash`) never round-trips to the client; one with `writeAs` submits under its declared input key instead of its column name.
