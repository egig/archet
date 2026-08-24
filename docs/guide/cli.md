# CLI Reference

```sh
arche <command>
```

## `arche init`

Scaffolds a new project in the current directory: `package.json`, `tsconfig.json`, `arche.config.ts`, `models/example.model.ts`, `drizzle/migrations/`, and a `.gitignore`. Never overwrites a file that already exists — safe to re-run.

## `arche generate`

Reads `models/**/*.model.ts` and emits, into `generatedDir` (`.arche/` by default):

- `schema.ts` — the Drizzle schema
- `validators.ts` — Zod validators
- `registry.ts` — the model registry `arche serve` and `arche build` read from

Run this any time your models change and you're not using `arche dev`.

## `arche migrate`

Regenerates the schema, then runs `drizzle-kit generate` + `drizzle-kit migrate` against `migrationsDir` (`drizzle/migrations/` by default). Use this for a durable, versioned migration history — the workflow you want outside of local development.

## `arche dev`

Watches `models/**/*.model.ts`. On every change: regenerates, runs `drizzle-kit push` (pushes schema changes directly, no migration files), and restarts the dev server. Faster iteration loop than `migrate`, intended for local development only.

## `arche serve`

Boots the API server: reads `arche.config.ts` and the generated registry, and starts a listening server with `/admin`, `/api/auth/*`, and `/api/:model` mounted. No server entry file needed.

```sh
PORT=3000 DATABASE_URL=postgres://... arche serve
```

## `arche build`

Builds the admin client (esbuild + Tailwind, hashed assets + manifest) and a bundled server artifact, for deploying without `tsx`/dev tooling at runtime.

## `arche studio`

Proxies to `drizzle-kit studio`, for browsing/editing your Postgres database directly.
