---
layout: home

hero:
  name: Ratchet
  text: Models in, App out.
  tagline: RATher an arCHEType, you build something out of.
  image:
    light: /logo.png
    dark: /logo-dark.png
    alt: Ratchet
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/egig/ratchet

features:
  - title: Models -> Schema
    details: Define a model once with defineModel() and field(); Ratchet generates the Drizzle schema, Zod validators, and a model registry for you.
  - title: One generic REST API
    details: Every model gets GET/POST/PATCH/DELETE at /api/:model for free — filtering, sorting, cursor and offset pagination, and ?include= relations included.
  - title: Composable pipelines
    details: create/update/remove are just pipe(...) chains of small functions around validate and persist — insert your own business logic anywhere in the chain.
  - title: Auth and console, batteries included
    details: Session-based auth (register/login/logout/me), role/permission checks, and a generated console SPA ship with the framework.
---
