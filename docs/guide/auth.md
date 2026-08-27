# Auth

`ratchet/auth` provides session-based authentication (`User`, `Role`, `Permission`, `Session` models, plus a router and pipeline helpers) that `ratchet serve` mounts at `/api/auth`, ahead of the generic `/api/:model` router.

## Endpoints

| Method | Path | |
|---|---|---|
| `GET` | `/api/auth/setup` | whether a root admin still needs to be created |
| `POST` | `/api/auth/setup` | one-time bootstrap: create the root admin |
| `POST` | `/api/auth/register` | create a user, issue a session |
| `POST` | `/api/auth/login` | verify credentials, issue a session |
| `POST` | `/api/auth/logout` | invalidate the current session |
| `GET` | `/api/auth/me` | current user + their permissions |
| `PATCH` | `/api/auth/me` | update your own `email` / `password` |

`setup`, `register`, and `login` all return `{ data: { user, token } }` (setup's `GET` returns `{ data: { required } }` instead) and set an `HttpOnly` session cookie (`Secure` when the request is HTTPS). The console SPA relies on the cookie; non-browser clients can instead send `Authorization: Bearer <token>`.

`PATCH /api/auth/me` is self-service: any signed-in user can change their own `email` and `password` without the `users:update` permission that gates admin-driven edits through `PATCH /api/users/:id`. Only those two keys are honoured — `roleId`, `active`, and everything else are ignored — and the write still runs through the `User` model's own `update` pipeline (`hashPassword` + `validate`). It returns the same `{ data: <user + permissions> }` shape as `GET /me`. The console exposes it as the **Edit profile** page (`/profile`), linked from the account menu in both the sidebar and the workspace header.

## Root admin onboarding

A fresh instance has no users, so `requirePermission` would lock everyone out with no way to grant the first permission. `POST /api/auth/setup` closes that gap: it's unauthenticated, but only works once — it checks whether any user already holds a `*:*` permission (via their role) and 409s (`SETUP_ALREADY_COMPLETE`) if so. Otherwise it creates (or reuses) a `Root` role with a `{resource: '*', action: '*'}` permission, creates the submitted user under that role, and signs them in — the same shape as `register`/`login`.

The console SPA's `AuthProvider` checks `GET /api/auth/setup` on boot alongside `/me`. While a root admin doesn't yet exist, every console route redirects to its `/setup` route (a form styled like the login page, with a confirm-password field) instead of `/login`; once it's created, `/setup` itself redirects away.

Root status is keyed off the permission, not user count — a user created through public `/register` (below) has no role and no permissions, so it doesn't count, and `/register` itself is unaffected by whether setup has run.

```sh
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"hunter2"}'

curl http://localhost:3000/api/auth/me \
  -H 'Authorization: Bearer <token>'
```

## How passwords are handled

The `User` model never declares a plaintext `password` field. Instead its `passwordHash` column declares `writeAs: 'password'`, and the `hashPassword` pipeline function intercepts `ctx.input.password`, hashes it, and rewrites it as `passwordHash` before `validate` runs. `passwordHash` itself is `sensitive: true`, so it's never present in a response.

## Auth + permission is implicit on the generic router

Every route on the generic `/api/:model` router requires a matching `Permission` row by default — including reads, which use an implicit `'read'` action (there's no per-model `read` operation to compose a pipeline step into, unlike create/update/remove). A model author doesn't need to do anything to get this; it applies automatically, the same way `redactSensitiveFields` or `?include=` do.

A model that must stay reachable with no session at all (a public read-only catalog, say) opts out with `api: { public: true }`:

```ts
export const Announcement = defineModel('announcements', {
  fields: { /* ... */ },
  api: { public: true },
});
```

`public` applies to every verb on that model — there's no per-operation granularity today.

`requireAuth` and `requirePermission(resource, action)` still exist as ordinary [pipeline functions](/guide/pipelines), for a dedicated router that bypasses the generic one entirely (e.g. `Chat`/`Message`'s own `/api/automation/*` routes, or an agent tool call — `automation/tool.ts`'s `executeModelOperationTool` calls `authorizeRequest`, the same check under the hood, before ever touching a model's pipeline):

- `requireAuth` resolves the `Bearer` token or session cookie on `ctx.request` to a live, active user and stashes it on `ctx.user`. Throws `UNAUTHENTICATED` (401) otherwise.
- `requirePermission(resource, action)` must run after `requireAuth`. It checks the user's role owns a permission matching `(resource, action)` — either side may be granted as `*`. Throws `FORBIDDEN` (403) otherwise, or `UNAUTHENTICATED` if `requireAuth` didn't run first.

## Roles and permissions

`Role` and `Permission` are ordinary models, managed like any other through the generic REST API (or the console) — grant a role a permission by creating a `Permission` row with `{ roleId, resource, action, field }`, using `'*'` for `resource`/`action` to grant broadly.

`Role` also declares a `setPermissions` [custom operation](/guide/custom-operations) (`src/auth/models/role.model.ts`, a real, worked example of both a custom operation *and* a [custom form](/guide/console#custom-forms) working together): `POST /api/roles/:id/setPermissions` with `{ targets: [{ resource, action, field? }, ...] }` replaces the role's *entire* grant list in one call — inserting what's newly granted, soft-removing what's dropped — instead of creating/deleting individual `Permission` rows one at a time. It's what backs a console-style permission editor (a tree of resource/action/field checkboxes, `'*'` collapsing a whole subtree into one wildcard row) that edits a role's own fields and its grants in a single form/submit; the operation itself is gated the same "two independent checks" way any custom operation is (see [Permissions](/guide/custom-operations#permissions)) — the router's own `roles:setPermissions` grant, plus a `permissions:create` field grant (since the actual write is `Permission` rows, not one of `Role`'s own fields).

## Field-level permission

`field` names one field of `resource` a role may read (`action: 'read'`) or write (`action: 'create'`/`'update'`) — or `'*'` for every field. It's required on a `read`/`create`/`update`/`'*'` row and doesn't apply at all to `remove` (which gates a whole row, never individual fields).

```
{ roleId, resource: 'invoices', action: 'read', field: 'total' }
{ roleId, resource: 'invoices', action: 'read', field: 'customerNotes' }
{ roleId, resource: 'invoices', action: 'update', field: '*' }
```

This is **secure-by-default, with no implicit "all fields"**: a role with a `(resource, action)` grant but no matching `field` grant gets zero fields for that action, not every field. A read that field permission denies simply omits that key from the response (the same shape `sensitive: true` fields already get); a write that touches a denied field is rejected outright, naming every offending key, rather than silently dropping it. `?filter=`/`?sort=` on a field a role can't read is rejected the same way — otherwise field-read denial would be a trivial oracle to route around.

Two things are always exempt from field-level permission, for every role:

- **Auto-injected system columns** (`id`, `createdAt`, `updatedAt`, `deletedAt`, `createdById`) — they aren't declarable via `field.*` in the first place, and gating them would break pagination cursors, `?include=`, and file-field URLs for no security benefit.
- **`sensitive: true`** fields (e.g. a password hash) — that's a separate, absolute, non-role-based redaction: it never reaches *any* role, whereas field permission is about fields that are fine for some roles but not others.

`?include=`d relations are filtered by the same field grant, using the requesting role's `read` permission on the *related* model — embedding a row via `?include=` can't be used to see fields that model's own permission denies.

### Bootstrapping

Because there's no implicit "all fields," the Root role `POST /api/auth/setup` creates grants `{ resource: '*', action: '*', field: '*' }` in one row — the `'*'` on `field` is what keeps the freshly-created admin able to see/edit anything immediately, the same way `'*'` on `resource`/`action` already did. When granting a narrower role by hand, remember `field` needs its own row (or `'*'`) for `read`/`create`/`update` — a grant that only sets `resource`/`action` and leaves `field` unset is rejected by `requireValidPermissionTarget`, not silently treated as "everything."
