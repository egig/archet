# Getting Started

Ratchet turns a directory of TypeScript model files into a Postgres schema, a REST API, a console, and auth — with composable pipelines wherever you need custom logic.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- A Postgres database, reachable via a `DATABASE_URL` connection string

## Scaffold a project

```sh
bunx @egig/ratchet init
```

This writes `package.json`, `tsconfig.json`, `ratchet.config.ts`, `models/example.model.ts`, `drizzle/migrations/`, and a `.gitignore` into the current directory. It never overwrites a file that's already there, so it's safe to re-run in a partially set-up directory.

`ratchet.config.ts` points at your models and where generated output should go:

```ts
import { defineConfig } from '@egig/ratchet/core';

export default defineConfig({
  db: { connectionString: process.env.DATABASE_URL! },
  modelsDir: 'models',
  generatedDir: '.ratchet',
  migrationsDir: 'drizzle/migrations',
});
```

## Install and configure

```sh
bun install
export DATABASE_URL=postgres://user:pass@localhost:5432/mydb
```

## Define a model

`models/example.model.ts` (written by `init`):

```ts
import { defineModel, field } from '@egig/ratchet/core';

export const Example = defineModel('examples', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
  },
});
```

See [Models & Fields](/guide/models) for the full field vocabulary and how relations, defaults, and console options work.

## Generate, migrate, serve

```sh
bun run generate   # models/**/*.model.ts -> .ratchet/{schema,validators,registry}.ts
bun run migrate     # regenerate, then drizzle-kit generate + migrate
bun run serve        # boot the API + console
```

`ratchet serve` reads `ratchet.config.ts` and the generated registry and boots a listening server — there's no server entry file to hand-write. It mounts, in order:

- `/api/auth/*` — register/login/logout/me
- `/api/:model` — the generic REST router, one route family for every model
- `/console` — the generated console SPA (customize with `consolePath`; registered last since it can be mounted at `/`, see [Console](/guide/console))

For local iteration, `bun run dev` watches `models/**/*.model.ts` and on every change regenerates, runs `drizzle-kit push`, and restarts the dev server — faster than the migration-file workflow, intended for development only.

## Next steps

- [Models & Fields](/guide/models) — the field vocabulary, relations, and console metadata
- [Pipelines](/guide/pipelines) — where your business logic goes
- [REST API](/guide/router) — filtering, sorting, pagination, and `?include=`
- [CLI Reference](/guide/cli) — every `ratchet` command
