# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Multi-column sort**: `?sort=` now takes a comma-separated, priority-ordered list of keys — `?sort=status,-createdAt` sorts by `status` ascending, then `createdAt` descending. `id`/`createdAt`/`updatedAt`/`createdById` are always sortable (previously only `indexed: true` fields were).
- Console: sortable column headers plus a "Sort" panel next to "Filter" — click a header to sort by it (cycles asc → desc → off), shift-click to add it as a secondary key, or compose the full ordered list in the panel. Works on model list pages (as a shareable `?sort=` URL overlay) and on workspace tabs (persisted to the saved view).
- Granular, per-field permission: `Permission` rows can now name a `field` (`resource`/`action`/`field`, any of which may be `'*'`) to grant a role read/write access to individual fields of a model, not just whole resource:action pairs.
- `ilike` filter operator — the case-insensitive form of `like` for string/text fields (`?filter=[["name","ilike","%ada%"]]`).
- `Workspace.chatEnabled` (defaults `true`): a persistent per-workspace setting that removes the console's agent chat panel and its show/hide toggle entirely when off, distinct from the per-browser hide toggle.
- Console: `reference` fields now render as a searchable combobox instead of a plain `<select>` — typing filters server-side (`ilike` on the target model's `displayField`) when that field is an indexed string, and falls back to client-side filtering of the first 100 rows otherwise.
- Console: workspace tabs can be renamed inline (double-click the tab label); the sidebar account menu has a "Workspace" link back to the signed-in user's workspace.
- **Custom operations**: a model can now declare named operations beyond `create`/`update`/`remove` (e.g. a `lock`/`unlock` button that's really an `update` with a fixed field value) as extra keys in `operations`, dispatched by a new generic `POST /:model/:id/:operation` route. `presetFields()` (`ratchet/auth`) is the sugar helper for the common "write these fixed fields" case; a custom operation can also declare `params` (validated request input, same `field.*()` DSL as model fields) and a `console` block (label, confirm, placement, a data-driven `visibleWhen`) controlling how it renders as a button — with a param-taking operation auto-rendering a small modal form — in the generated console. See the "Custom Operations" guide.
- **Console: custom model forms**: a `<name>.form.tsx` under `modelsDir` (`<name>` being a model's own name, e.g. `customers.form.tsx`) replaces that model's generated create/edit form entirely — `ratchet generate` collects them into a registry the console client bundle imports, rejecting an unmatched or duplicate name. It receives `fields`, the model's own fields each pre-bound to their built-in editor (`fields[name].render({ value, onChange, error? })` renders a `reference` dropdown/`file` upload/`manyToMany` multiselect/etc. without switching on field kind by hand; `fields[name].meta` is that field's metadata), plus `getRow`/`createRow`/`updateRow`/`useModels`/`useAuth`/`FieldInput` exported from `@egig/ratchet/console/client` for everything else — so a custom form doesn't have to reinvent the generated one's building blocks. A custom form's own Tailwind classes are scanned into the console bundle's stylesheet the same way the framework's own components are. See the "Console" guide's "Custom forms" section.
- **Console: custom field inputs**: a `<model>.<field>.input.tsx` under `modelsDir` (e.g. `customers.email.input.tsx`) replaces just that field's input — everywhere it would normally render (the generated form, and `fields[name].render(...)` in a custom form, above) — with no change to the model definition needed, unlike the existing model-declared `field.custom(name, base)` (which this now takes priority over). `ratchet generate` rejects an unmatched model/field, a malformed filename, or two inputs for the same model+field. See the "Console" guide's "Custom field inputs" section.
- **`field.tree()`**: a self-referencing parent-pointer hierarchy on a model — for a `Category` tree, a Chart-of-Accounts `Account`, an org chart's `managerId`, or any other tree-shaped data. A model may declare at most one; `defineModel()` resolves its target to the model's own name automatically. `?include=parent` embeds the parent row, `?filter=`/`?sort=` work like `reference`'s, and every write is checked for cycles (reparenting a node under itself or one of its own descendants is rejected with `TREE_CYCLE`) before it commits. The console renders it as a searchable tree picker (`parent / child` breadcrumb labels) that excludes the record being edited and its descendants from the option list. See the "Models & Fields" guide's "Tree / hierarchy fields" section.

### Changed

- **Breaking:** the framework's tooling and runtime moved from Node/npm to [Bun](https://bun.sh) — `ratchet` (including `ratchet serve`) now runs under Bun, package installs use `bun install`, and the framework's own build/test scripts use `Bun.build`/`bun test` instead of esbuild/tsx/vitest. Consumer apps need Bun 1.3+ installed; `ratchet init` scaffolds a Bun-based `package.json` accordingly. `ratchet build`'s generated `dist/server.js` still targets plain Node (via `@hono/node-server`), so a VPS/container deploy doesn't need Bun.
- **Breaking:** the generic `/api/:model` router now requires a matching `Permission` row for *every* route by default, including reads (a new implicit `'read'` action) — previously only create/update/remove were gated, and only when a model author manually composed `requireAuth`/`requirePermission` into its pipeline. A model that must stay reachable without a session opts out via the new `api: { public: true }`.
- **Breaking:** field-level access is secure-by-default — a role with a `(resource, action)` grant but no matching `field` grant gets zero fields, not every field. Existing `Permission` rows need a `field: '*'` added (or per-field rows) to keep working after upgrading; the bootstrap Root role created by `POST /api/auth/setup` already does this automatically.
- `requireAuth`/`requirePermission` no longer need to be composed by hand into a model's own `operations` — the router applies both automatically. They're still exported for custom/dedicated routers that bypass the generic router entirely (e.g. an agent tool call, `automation/tool.ts`).
- **Breaking:** `Workspace` freezes/unfreezes a row via `lock`/`unlock` custom operations (built on `presetFields()`, above) instead of a plain `PATCH { locked: … }` — a role needs its own `lock`/`unlock` grant in addition to the `update`+`locked` field grant it already needed. The console's "Lock workspace"/"Unlock workspace" button calls the new operations.
- **Breaking:** a bare `?sort=` on `GET /api/:model` is now offset-mode (response `meta` is `{ total, limit, offset }`, just ordered) instead of switching to cursor-mode. Cursor-mode pagination now requires an explicit `?cursor=` (pass it empty for the first page) alongside a single-key `?sort=`.
- **Breaking:** `workspace_views.sortField` + `sortDirection` are replaced by a single `sort` JSONB column holding an ordered `[{ field, direction }]` list. Consumer apps must re-run `ratchet migrate`; the `update_workspace_views` agent tool now takes `sort` instead of the two scalar fields.

### Fixed

- `ratchet dev`/`ratchet build` no longer shell out to `npx tailwindcss` for the console stylesheet — it invoked the Tailwind CLI as if it were a consumer dependency and failed with `could not determine executable to run` in any app that didn't also install `@tailwindcss/cli`. The framework now resolves and runs its own bundled `@tailwindcss/cli`.
- `ratchet dev` no longer prints `[dev] server exited with code 130` on Ctrl-C — the interrupt reaches the spawned server directly through the terminal, and that (plus signal kills) is now recognized as a deliberate shutdown rather than a crash. Shutdown also no longer hangs when the server has already exited.

## [v0.1.0] - 2026-08-24

Initial release.

### Added

- Model definitions (`defineModel()`, `field()`) that generate a Drizzle schema, Zod validators, and a model registry.
- Generic REST API — `GET`/`POST`/`PATCH`/`DELETE` at `/api/:model` with filtering, sorting, cursor and offset pagination, and `?include=` relations.
- Composable pipelines: `create`/`update`/`remove` as `pipe(...)` chains around `validate` and `persist`.
- Session-based auth router (register/login/logout/me) with role/permission checks.
- Generated console SPA, mountable via `createConsoleRouter`.
- `ratchet` CLI (`build`, `generate`, `migrate`, `serve`).
- Runtime-agnostic routers (`createApiRouter`, `createAuthRouter`, `createConsoleRouter`) usable outside Node, alongside Node-only `ratchet build`/`serve` tooling.
- VitePress documentation site, deployed to GitHub Pages.

[Unreleased]: https://github.com/egig/ratchet/compare/v0.1.0...HEAD
[v0.1.0]: https://github.com/egig/ratchet/releases/tag/v0.1.0
