# Custom Operations

Every model gets three builtin operations — `create`, `update`, `remove` — dispatched by the generic router. A **custom operation** is a fourth (fifth, sixth, ...) named operation a model declares itself, for a convenient action that's really just a specific write in disguise — the canonical example is a `lock`/`unlock` button that's really an `update` with `locked` set to a fixed value.

```ts
import { defineModel, field } from '@egig/ratchet/core';
import { presetFields } from '@egig/ratchet/auth';

export const Document = defineModel('documents', {
  fields: {
    title: field.string({ required: true }),
    locked: field.boolean({ default: false }),
  },
  operations: {
    lock: presetFields({ locked: true }),
    unlock: {
      pipeline: presetFields({ locked: false }),
      console: { label: 'Unlock', placement: ['row'], visibleWhen: { field: 'locked', equals: true } },
    },
  },
});
```

This gets you, for free: `POST /api/documents/:id/lock` and `/unlock`, a `resource:lock`/`resource:unlock` permission target the console's permission editor already lists, and — once the model's field grants also cover `locked` (see [Permissions](#permissions) below) — a "Lock"/"Unlock" button in the console's row actions.

## Declaring one

A custom operation is an extra key in `operations`, alongside `create`/`update`/`remove`. Its value is either:

- a plain `PipelineFn` — a fully custom operation, no params, default console presentation, or
- a `CustomOperationDefinition`: `{ pipeline, params?, console? }`.

`create`, `update`, `remove`, `read`, `upload`, and `*` are reserved — `defineModel` throws if you try to name a custom operation one of these (the first three already have a fixed meaning; `read`/`*` are reserved by the permission system; `upload` would collide with `POST /:model/:field/upload`).

### `presetFields` — the common case

`presetFields(values, opts?)` (from `ratchet/auth`) builds a `PipelineFn` that merges `values` on top of whatever's already in `ctx.input`, checks the combined set against the caller's field-write permission (see below), then runs it through the same `validate` + `persist` any `update` uses. `opts.permissionAction` (default `'update'`) lets you check against a different action's field grants if your model's base write isn't a plain update.

For anything beyond "write these fixed fields," write your own `PipelineFn` — a custom operation composes with [`pipe()`](/guide/pipelines) exactly like `create`/`update`/`remove` do, and can do anything a pipeline function can: call `persist`/`persist.remove`, call an external API, send an email, or not touch the database at all.

### Params

A no-arg operation (like `lock`/`unlock`) is a plain trigger — `POST` with no body. An operation that needs input declares `params` with the same `field.*()` builder DSL used for model fields:

```ts
operations: {
  reject: {
    pipeline: presetFields({ status: 'rejected' }),
    params: { reason: field.string({ required: true }) },
  },
},
```

The request body is validated against `params` the same way a `create` body is validated against a model's fields (`buildParamsSchema`, mirroring `buildCreateSchema`) — an invalid or missing required param 400s with `VALIDATION_ERROR` before the pipeline ever runs. Whatever validates successfully lands in `ctx.input`, merged with any preset values `presetFields` adds on top.

## The route

Every custom operation is dispatched by one generic route: `POST /:model/:id/:operation`. Always `POST`, always scoped to one record by `:id`, regardless of what the operation's pipeline does internally. The response shape matches `update`/`remove`: `{ data: <the operation's resulting doc, or null> }`.

```sh
curl -X POST http://localhost:3000/api/documents/<id>/lock \
  -H 'Authorization: Bearer <token>'

curl -X POST http://localhost:3000/api/documents/<id>/reject \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"reason":"missing signature"}'
```

## Permissions

A custom operation is gated by **two independent checks**, both of which must pass:

1. **The operation's own action grant** — `{ resource: 'documents', action: 'lock' }` — checked by the router before the pipeline ever runs, the same way a `GET` checks its implicit `read` action. This is a whole-operation grant with no field concept (like `remove`), so a `Permission` row for it must never carry a `field`.
2. **Whatever field grant the operation's own writes need** — for `presetFields({ locked: true })`, that's `{ resource: 'documents', action: 'update', field: 'locked' }` (or `field: '*'`), checked *inside* `presetFields` itself, exactly as if the caller had `PATCH`ed `{ locked: true }` directly.

Neither grant alone is enough. This is deliberate: it keeps "can perform this convenience action" and "can freely edit this field" separately grantable — a support role can be handed `lockable_docs:lock` without also getting general `update` access to `locked`, but the underlying write is never weaker than a real `PATCH` would require.

If your pipeline doesn't perform a field-shaped write at all (an operation that only sends an email, say), only the first check applies — there's nothing for a field grant to gate.

## Console rendering

`CustomOperationDefinition.console` controls how an operation shows up in the generated admin console:

```ts
console?: {
  label?: string;                          // default: the operation's key, humanized
  confirm?: boolean | string;              // shows a confirm dialog before calling it
  placement?: ('row' | 'detail' | 'bulk')[]; // default: ['row']
  visibleWhen?: { field: string; equals?: unknown; notEquals?: unknown; in?: readonly unknown[] };
}
```

- **`placement`** — `'row'` puts a button in the list view's row actions (next to Edit/Delete); `'detail'` adds it to the record's edit page. `'bulk'` is reserved for a param-less operation applied to every selected row — `defineModel` rejects `placement: ['bulk']` on an operation that also declares `params`.
- **`visibleWhen`** — a single-field comparison evaluated against the row's current data, so `lock` and `unlock` can each show only when relevant (`locked === false` / `locked === true`) instead of both always being visible. This has to stay a small, JSON-serializable rule rather than arbitrary code — console metadata crosses the wire as JSON, the same reason a model's own field metadata never carries a live Zod schema.
- **`confirm`** — `true` shows a generic confirm dialog, a string shows that message instead. Has no effect on a param-taking operation, since its param modal's own Submit button already doubles as the confirmation step.
- **Params** render as a small modal form (built the same way the create/update form is, including file uploads and reference dropdowns) instead of firing immediately — see [Params](#params) above.

An operation with no `console` block at all still renders — as a row-action button labeled from its key, no confirm, no visibility condition. `console` only customizes the default, it isn't required to opt in.
