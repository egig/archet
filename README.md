<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/logo-dark.png">
    <img src="docs/public/logo.png" alt="Ratchet" width="120">
  </picture>
</p>

<h1 align="center">Ratchet</h1>

<p align="center">Model driven application framework: TypeScript models -> Postgres schema, codegen, and composable pipelines.</p>

Ratchet turns a directory of TypeScript model files into a Postgres schema, a REST API, a console, and auth — with composable pipelines wherever you need custom logic.

## Install

```sh
npm install @egig/ratchet
```

## Prerequisites

- Node.js 20+
- A Postgres database, reachable via a `DATABASE_URL` connection string

## Scaffold a project

```sh
npx @egig/ratchet init
```

This writes `package.json`, `tsconfig.json`, `ratchet.config.ts`, `models/example.model.ts`, `drizzle/migrations/`, and a `.gitignore` into the current directory. It never overwrites a file that's already there, so it's safe to re-run in a partially set-up directory.

## Define a model

```ts
import { defineModel, field } from '@egig/ratchet/core';

export const Example = defineModel('examples', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
  },
});
```

## Generate, migrate, serve

```sh
npm run generate   # models/**/*.model.ts -> .ratchet/{schema,validators,registry}.ts
npm run migrate    # regenerate, then drizzle-kit generate + migrate
npm run serve       # boot the API + console
```

`ratchet serve` reads `ratchet.config.ts` and the generated registry and boots a listening server. It mounts, in order:

- `/api/auth/*` — register/login/logout/me
- `/api/:model` — the generic REST router, one route family for every model (filtering, sorting, cursor and offset pagination, `?include=` relations)
- `/console` — the generated console SPA

## Documentation

Full guides (models & fields, pipelines, the REST API, CLI reference) are in [`docs/`](./docs).

## License

MIT
