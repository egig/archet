# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Granular, per-field permission: `Permission` rows can now name a `field` (`resource`/`action`/`field`, any of which may be `'*'`) to grant a role read/write access to individual fields of a model, not just whole resource:action pairs.
- `ilike` filter operator — the case-insensitive form of `like` for string/text fields (`?filter=[["name","ilike","%ada%"]]`).
- `Workspace.chatEnabled` (defaults `true`): a persistent per-workspace setting that removes the console's agent chat panel and its show/hide toggle entirely when off, distinct from the per-browser hide toggle.
- Console: `reference` fields now render as a searchable combobox instead of a plain `<select>` — typing filters server-side (`ilike` on the target model's `displayField`) when that field is an indexed string, and falls back to client-side filtering of the first 100 rows otherwise.
- Console: workspace tabs can be renamed inline (double-click the tab label); the sidebar account menu has a "Workspace" link back to the signed-in user's workspace.
- **Custom operations**: a model can now declare named operations beyond `create`/`update`/`remove` (e.g. a `lock`/`unlock` button that's really an `update` with a fixed field value) as extra keys in `operations`, dispatched by a new generic `POST /:model/:id/:operation` route. `presetFields()` (`ratchet/auth`) is the sugar helper for the common "write these fixed fields" case; a custom operation can also declare `params` (validated request input, same `field.*()` DSL as model fields) and a `console` block (label, confirm, placement, a data-driven `visibleWhen`) controlling how it renders as a button — with a param-taking operation auto-rendering a small modal form — in the generated console. See the "Custom Operations" guide.

### Changed

- **Breaking:** the generic `/api/:model` router now requires a matching `Permission` row for *every* route by default, including reads (a new implicit `'read'` action) — previously only create/update/remove were gated, and only when a model author manually composed `requireAuth`/`requirePermission` into its pipeline. A model that must stay reachable without a session opts out via the new `api: { public: true }`.
- **Breaking:** field-level access is secure-by-default — a role with a `(resource, action)` grant but no matching `field` grant gets zero fields, not every field. Existing `Permission` rows need a `field: '*'` added (or per-field rows) to keep working after upgrading; the bootstrap Root role created by `POST /api/auth/setup` already does this automatically.
- `requireAuth`/`requirePermission` no longer need to be composed by hand into a model's own `operations` — the router applies both automatically. They're still exported for custom/dedicated routers that bypass the generic router entirely (e.g. an agent tool call, `automation/tool.ts`).
- **Breaking:** `Workspace` freezes/unfreezes a row via `lock`/`unlock` custom operations (built on `presetFields()`, above) instead of a plain `PATCH { locked: … }` — a role needs its own `lock`/`unlock` grant in addition to the `update`+`locked` field grant it already needed. The console's "Lock workspace"/"Unlock workspace" button calls the new operations.

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
