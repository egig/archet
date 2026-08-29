# Contributing to Ratchet

Thanks for your interest in improving Ratchet. This guide covers how to set up the
repo, build it, run the tests, and get a change merged.

## Prerequisites

- [Bun](https://bun.sh) 1.3+ — Ratchet uses Bun as its package manager, bundler,
  test runner, and runtime. (This repo is currently developed against Bun 1.4.)
- A Postgres database for running the DB-backed tests, reachable via a
  `DATABASE_URL` connection string. The repo ships a compose file at
  [`example/docker-compose.yml`](example/docker-compose.yml) that stands one up.
- Node is **not** required to develop the framework. It's only relevant because
  `ratchet build` emits a plain-Node server artifact for consumer app deploys.

## Getting set up

```sh
git clone https://github.com/egig/ratchet
cd ratchet
bun install
```

## Building

```sh
bun run build
```

This runs [`scripts/build.ts`](scripts/build.ts), which:

1. Bundles each source file under `src/{core,cli,codegen,router,auth,automation,workspace,console}`
   with `Bun.build` (unbundled — one output file per source file, imports emitted
   as written) into `dist/`.
2. Runs `tsc -p tsconfig.build.json --emitDeclarationOnly` for the `.d.ts` files.
3. Marks `dist/cli/bin.js` executable and copies the console client stylesheet.

The published package is just `dist/` (see the `files` field in
[`package.json`](package.json)).

## Typechecking

`tsc` owns type-checking — the bundler does not. Run it before sending a change:

```sh
bun run typecheck
```

## Running the tests

```sh
bun test
```

Tests live in [`test/`](test/) and run under `bun test` (`bun:test`, not vitest).

Several suites need a live Postgres — they read `process.env.DATABASE_URL` and
**silently skip** (via `describe.skip`) when it's unset, so a bare `bun test`
will pass without exercising them. To run the full suite:

```sh
# start Postgres (example compose file)
docker compose -f example/docker-compose.yml up -d postgres

export DATABASE_URL=postgres://postgres:postgres@localhost:5432/ratchet_example
bun test
```

Each DB-backed suite creates and drops its own tables, so point `DATABASE_URL` at
a throwaway database.

## Trying changes against the example app

The [`example/`](example/) directory is a working Ratchet project used for manual
testing. From the repo root:

```sh
bun run cli -- <command>   # runs src/cli/bin.ts inside example/
bun run serve              # ratchet serve inside example/
```

## Docs

Docs are a [Fumadocs](https://fumadocs.dev) (React Router) site under [`docs/`](docs/),
with its own `package.json` — install its dependencies once with `bun install`
at the repo root (it's a Bun workspace member):

```sh
bun run docs:dev       # local preview with hot reload
bun run docs:build     # prerendered static build to docs/build/client/
```

User-facing changes should update the relevant page in `docs/content/docs/` and
add an entry to the `[Unreleased]` section of [`CHANGELOG.md`](CHANGELOG.md)
(Keep a Changelog format; mark breaking changes **Breaking:**) — the docs
site's own Changelog page is generated from that file at build time.

## Submitting a change

1. Branch off `main`.
2. Make the change, with tests where it's testable.
3. Make sure `bun run typecheck` and `bun test` (with `DATABASE_URL` set) both pass.
4. Update `docs/` and `CHANGELOG.md` for any user-facing change.
5. Open a PR against `main` with a description of what changed and why. Keep the
   commit summary in the imperative mood, matching the existing history
   (e.g. "Add field.tree() for self-referencing hierarchical data").

## Project layout

| Path | What's there |
| --- | --- |
| `src/core/` | `defineModel`, `field.*`, config, the model registry |
| `src/codegen/` | model files → Drizzle schema / Zod validators / registry |
| `src/router/` | the generic `/api/:model` REST router |
| `src/auth/` | User/Role/Permission/Session models and pipeline helpers |
| `src/automation/` | agent tools / automation surface |
| `src/workspace/` | the `Workspace` model and saved views |
| `src/console/` | the console SPA (`client/`) and its server-side assets |
| `src/cli/` | the `ratchet` CLI (`bin.ts`) |
| `test/` | `bun:test` suites |
| `docs/` | Fumadocs documentation site |
| `example/` | a working Ratchet app for manual testing |

## License

By contributing you agree that your contributions are licensed under the MIT
License, the same as the rest of the project.
