# CLI Reference

```sh
ratchet <command>
```

## `ratchet init`

Scaffolds a new project in the current directory: `package.json`, `tsconfig.json`, `ratchet.config.ts`, `models/example.model.ts`, `drizzle/migrations/`, and a `.gitignore`. Never overwrites a file that already exists — safe to re-run.

## `ratchet generate`

Reads `models/**/*.model.ts` and emits, into `generatedDir` (`.ratchet/` by default):

- `schema.ts` — the Drizzle schema
- `validators.ts` — Zod validators
- `registry.ts` — the model registry `ratchet serve` and `ratchet build` read from
- `console-forms.ts` — the [custom console form](/guide/console#custom-forms) registry, one entry per `models/**/*.form.tsx`

Run this any time your models change and you're not using `ratchet dev`.

## `ratchet migrate`

Regenerates the schema, then runs `drizzle-kit generate` + `drizzle-kit migrate` against `migrationsDir` (`drizzle/migrations/` by default). Use this for a durable, versioned migration history — the workflow you want outside of local development.

## `ratchet dev`

Watches `models/**/*.model.ts`. On every change: regenerates, runs `drizzle-kit push` (pushes schema changes directly, no migration files), and restarts the dev server. Faster iteration loop than `migrate`, intended for local development only.

## `ratchet serve`

Boots the API server: reads `ratchet.config.ts` and the generated registry, and starts a listening server with the console (`/console` by default — see `consolePath`), `/api/auth/*`, and `/api/:model` mounted. No server entry file needed.

```sh
PORT=3000 DATABASE_URL=postgres://... ratchet serve
```

## `ratchet build`

Builds the console client (Bun's bundler + Tailwind, hashed assets + manifest) and a bundled server artifact, for deploying without dev tooling at runtime.

## `ratchet studio`

Proxies to `drizzle-kit studio`, for browsing/editing your Postgres database directly.
