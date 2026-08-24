# Auth

`ratchet/auth` provides session-based authentication (`User`, `Role`, `Permission`, `Session` models, plus a router and pipeline helpers) that `ratchet serve` mounts at `/api/auth`, ahead of the generic `/api/:model` router.

## Endpoints

| Method | Path | |
|---|---|---|
| `POST` | `/api/auth/register` | create a user, issue a session |
| `POST` | `/api/auth/login` | verify credentials, issue a session |
| `POST` | `/api/auth/logout` | invalidate the current session |
| `GET` | `/api/auth/me` | current user + their permissions |

`register` and `login` both return `{ data: { user, token } }` and set an `HttpOnly` session cookie (`Secure` when the request is HTTPS). The admin SPA relies on the cookie; non-browser clients can instead send `Authorization: Bearer <token>`.

```sh
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"hunter2"}'

curl http://localhost:3000/api/auth/me \
  -H 'Authorization: Bearer <token>'
```

## How passwords are handled

The `User` model never declares a plaintext `password` field. Instead its `passwordHash` column declares `writeAs: 'password'`, and the `hashPassword` pipeline function intercepts `ctx.input.password`, hashes it, and rewrites it as `passwordHash` before `validate` runs. `passwordHash` itself is `sensitive: true`, so it's never present in a response.

## Guarding your own pipelines

`requireAuth` and `requirePermission(resource, action)` are ordinary [pipeline functions](/guide/pipelines) — compose them into any model's operations:

```ts
import { pipe, validate, persist } from 'ratchet/core';
import { requireAuth, requirePermission } from 'ratchet/auth';

export const Invoice = defineModel('invoices', {
  fields: { /* ... */ },
  operations: {
    create: pipe(requireAuth, requirePermission('invoices', 'create'), validate, persist),
  },
});
```

- `requireAuth` resolves the `Bearer` token or session cookie on `ctx.request` to a live, active user and stashes it on `ctx.user`. Throws `UNAUTHENTICATED` (401) otherwise.
- `requirePermission(resource, action)` must run after `requireAuth`. It checks the user's role owns a permission matching `(resource, action)` — either side may be granted as `*`. Throws `FORBIDDEN` (403) otherwise, or `UNAUTHENTICATED` if `requireAuth` didn't run first.

## Roles and permissions

`Role` and `Permission` are ordinary models, managed like any other through the generic REST API (or the admin panel) — grant a role a permission by creating a `Permission` row with `{ roleId, resource, action }`, using `'*'` for either field to grant broadly.
