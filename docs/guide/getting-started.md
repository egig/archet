# Getting Started

archet turns a directory of TypeScript model files into a Postgres schema, a REST API, an admin panel, and auth — with composable pipelines wherever you need custom logic.

## Prerequisites

- Node.js 20+
- A Postgres database, reachable via a `DATABASE_URL` connection string

## Scaffold a project

```sh
npx archet init
```

This writes `package.json`, `tsconfig.json`, `archet.config.ts`, `models/example.model.ts`, `drizzle/migrations/`, and a `.gitignore` into the current directory. It never overwrites a file that's already there, so it's safe to re-run in a partially set-up directory.

`archet.config.ts` points at your models and where generated output should go:

```ts
import { defineConfig } from 'archet/core';

export default defineConfig({
  db: { connectionString: process.env.DATABASE_URL! },
  modelsDir: 'models',
  generatedDir: '.archet',
  migrationsDir: 'drizzle/migrations',
});
```

## Install and configure

```sh
npm install
export DATABASE_URL=postgres://user:pass@localhost:5432/mydb
```

## Define a model

`models/example.model.ts` (written by `init`):

```ts
import { defineModel, field } from 'archet/core';

export const Example = defineModel('examples', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
  },
});
```

See [Models & Fields](/guide/models) for the full field vocabulary and how relations, defaults, and admin options work.

## Generate, migrate, serve

```sh
npm run generate   # models/**/*.model.ts -> .archet/{schema,validators,registry}.ts
npm run migrate     # regenerate, then drizzle-kit generate + migrate
npm run serve        # boot the API + admin panel
```

`archet serve` reads `archet.config.ts` and the generated registry and boots a listening server — there's no server entry file to hand-write. It mounts, in order:

- `/admin` — the generated admin SPA
- `/api/auth/*` — register/login/logout/me
- `/api/:model` — the generic REST router, one route family for every model

For local iteration, `npm run dev` watches `models/**/*.model.ts` and on every change regenerates, runs `drizzle-kit push`, and restarts the dev server — faster than the migration-file workflow, intended for development only.

## Next steps

- [Models & Fields](/guide/models) — the field vocabulary, relations, and admin metadata
- [Pipelines](/guide/pipelines) — where your business logic goes
- [REST API](/guide/router) — filtering, sorting, pagination, and `?include=`
- [CLI Reference](/guide/cli) — every `archet` command
