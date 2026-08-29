<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/logo-dark.png">
    <img src="docs/public/logo.png" alt="Ratchet" width="120">
  </picture>
</p>

<h1 align="center">Ratchet</h1>

<p align="center">A toolbox of general-purpose backend building blocks — schema codegen, a REST API, auth, a console, and composable pipelines.</p>

Ratchet isn't a models-in, API-out black box. It's a set of general-purpose tools — schema and migration codegen, a REST API, auth, an admin console, and composable pipelines — none of it unique to any one business. Point it at a directory of TypeScript model files and it wires up the Postgres schema, REST routes, and console for you; the pipelines are where your own business logic goes.

## Install

```sh
bun add @egig/ratchet
```

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- A Postgres database, reachable via a `DATABASE_URL` connection string

## Scaffold a project

```sh
bunx @egig/ratchet init
```

This writes `package.json`, `tsconfig.json`, `ratchet.config.ts`, `models/example.model.ts`, `migrations`, and a `.gitignore` into the current directory. It never overwrites a file that's already there, so it's safe to re-run in a partially set-up directory.

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
bun run generate   # regenerate .ratchet/*, then drizzle-kit generate -> SQL migration files
bun run migrate    # drizzle-kit migrate — apply the pending SQL migration files
bun run serve       # boot the API + console
```

`ratchet serve` reads `ratchet.config.ts` and the generated registry and boots a listening server. It mounts, in order:

- `/api/auth/*` — register/login/logout/me
- `/api/:model` — the generic REST router, one route family for every model (filtering, sorting, cursor and offset pagination, `?include=` relations)
- `/console` — the generated console SPA

## Documentation

Full guides (models & fields, pipelines, the REST API, CLI reference) are in [`docs/`](./docs).

## License

MIT
