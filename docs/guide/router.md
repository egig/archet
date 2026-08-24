# REST API

`arche serve` mounts one generic router at `/api/:model` — every model gets the same route family, dispatched by looking up `:model` in the registry at request time. There are no per-model generated route files.

## Routes

| Method | Path | |
|---|---|---|
| `GET` | `/api/:model` | list, with filtering/sorting/pagination |
| `GET` | `/api/:model/:id` | fetch one |
| `POST` | `/api/:model` | create — runs the model's `create` pipeline |
| `PATCH` | `/api/:model/:id` | update — runs the model's `update` pipeline |
| `DELETE` | `/api/:model/:id` | remove — runs the model's `remove` pipeline |

Every response body is `{ data, meta? }`. Errors are `{ error: { code, message, fields? } }` with a matching HTTP status (see [Errors](#errors)). Fields marked `sensitive: true` on the model are stripped from every response.

## Listing: `GET /api/:model`

### Pagination

- `?limit=` — default 20, clamped (not rejected) to a max of 100.
- `?offset=` — offset-mode pagination; response `meta` is `{ total, limit, offset }`.
- `?sort=` + `?cursor=` — cursor-mode pagination; response `meta` is `{ nextCursor, hasMore }`. A cursor requires an accompanying `?sort=`.

### Sorting

```
GET /api/invoices?sort=amount     # ascending
GET /api/invoices?sort=-amount    # descending, '-' prefix
```

Only fields declared `indexed: true` can be sorted on — otherwise the API returns `UNSORTABLE_FIELD`.

### Filtering

Simple equality filters are plain query params:

```
GET /api/invoices?status=paid
```

For anything beyond equality, pass `?filter=` as a JSON array of `[field, operator, value]` triples:

```
GET /api/invoices?filter=[["amount",">=","100"],["status","!=","draft"]]
```

Supported operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `like`, `is`. Only fields declared `indexed: true` can be filtered on (`UNFILTERABLE_FIELD` otherwise), and each operator must be valid for the field's kind (`INVALID_OPERATOR` otherwise).

### Relations: `?include=`

```
GET /api/invoices?include=customer
```

`include` takes a comma-separated list of relation names, derived by stripping the `Id` suffix from a `field.reference` key (`customerId` -> `customer`). Nested/dot-chained includes (`customer.company`) are rejected outright.

### Soft deletes

```
GET /api/invoices?includeDeleted=true
```

By default, soft-deleted rows (via `persist.remove`) are excluded from both list and single-record reads.

## Errors

Every route shares the same error shape. Common codes:

| Code | Status | |
|---|---|---|
| `VALIDATION_ERROR` | 400 | body failed the model's Zod schema, or a malformed query param |
| `MODEL_NOT_FOUND` | 404 | `:model` isn't in the registry |
| `NOT_FOUND` | 404 | no row for the given `:id` |
| `INVALID_INCLUDE` | 400 | unknown or nested `?include=` relation |
| `UNFILTERABLE_FIELD` / `UNSORTABLE_FIELD` | 400 | field isn't `indexed: true` |
| `INVALID_OPERATOR` | 400 | operator invalid, or not valid for the field's kind |

## Building your own router

`arche/router` exports the pieces `arche serve` composes for you, if you need to mount them yourself (e.g. inside a custom Hono app):

```ts
import { createApiRouter, buildRegistryMap } from 'arche/router';

const registry = buildRegistryMap(registryModule); // from .arche/registry.ts
const app = new Hono();
app.route('/api', createApiRouter(registry, db));
```
