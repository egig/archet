# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
