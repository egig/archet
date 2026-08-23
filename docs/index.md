---
layout: home

hero:
  name: archet
  text: Models in, API out.
  tagline: Archetype driven business application framework — TypeScript models compile to a Postgres schema, a REST API, an admin panel, and auth, with composable pipelines wherever you need custom logic.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/egig/archet

features:
  - title: Models -> Schema
    details: Define a model once with defineModel() and field(); archet generates the Drizzle schema, Zod validators, and a model registry for you.
  - title: One generic REST API
    details: Every model gets GET/POST/PATCH/DELETE at /api/:model for free — filtering, sorting, cursor and offset pagination, and ?include= relations included.
  - title: Composable pipelines
    details: create/update/remove are just pipe(...) chains of small functions around validate and persist — insert your own business logic anywhere in the chain.
  - title: Auth and admin, batteries included
    details: Session-based auth (register/login/logout/me), role/permission checks, and a generated admin SPA ship with the framework.
---
