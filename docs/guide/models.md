# Models & Fields

A model is defined once, with `defineModel()`, and drives everything else: the Postgres table, the Zod validators, the REST routes, and the console.

```ts
import { defineModel, field } from '@egig/ratchet/core';

export const Customer = defineModel('customers', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
    email: field.string({ required: true, unique: true, indexed: true, maxLength: 320 }),
  },
  console: { displayField: 'name' },
});
```

The first argument (`'customers'`) is both the table name and the `/api/:model` route segment — there's no auto-pluralization.

## Field types

All fields accept the common options below, plus any type-specific ones.

| Field | Type-specific options |
|---|---|
| `field.string(opts)` | `maxLength?: number` |
| `field.text(opts)` | — |
| `field.integer(opts)` | — |
| `field.decimal(opts)` | `precision: number`, `scale: number` (required) |
| `field.boolean(opts)` | — |
| `field.datetime(opts)` | — |
| `field.enum(values, opts)` | `values` is a non-empty array of string literals |
| `field.json(opts)` | `schema?: ZodTypeAny` — validates the JSON payload |
| `field.reference(targetModel, opts)` | `targetModel: string` — see [Relations](#relations) |
| `field.file(opts)` | `accept?: string`, `preview?: 'image'`, `maxSize?: number` — see [Files & images](#files-images) |

### Common options

```ts
interface FieldCommonOptions<T> {
  required?: boolean;
  default?: T;
  unique?: boolean;
  indexed?: boolean;
  sensitive?: boolean;
  writeAs?: string;
  displayText?: string;
}
```

- **`required`** and **`default`** are mutually exclusive — a field with a default is never absent, so declaring both throws at definition time.
- **`indexed`** gates whether a field can appear in `?filter=` or `?sort=` on the REST API (see [REST API](/guide/router)).
- **`sensitive`** marks a field as stored but stripped from every HTTP response — e.g. a password hash.
- **`writeAs`** is for a field written under a different, undeclared input key. For example, a `passwordHash` column declares `writeAs: 'password'` because a pipeline function (`hashPassword`) synthesizes the real column from a plaintext `password` key that never appears in `fields`. The console form reads this to know which key to submit under.
- **`displayText`** is the label shown for this field in console list-view column headers and form labels; when omitted it defaults to the field key humanized (e.g. `roleId` -> "Role Id").

## Files & images

```ts
avatar: field.file({ preview: 'image' }),       // accept defaults to 'image/*'
resume: field.file({ accept: 'application/pdf', maxSize: 5 * 1024 * 1024 }),
```

A `file` field stores a reference (`{ key, filename, mimeType, size }`, jsonb), not the bytes — the actual blob lives in whatever `FileStorageAdapter` the app passes to `createApiRouter(registry, db, storage)` (a Node filesystem adapter, `ratchet/storage/node`, is the default under `ratchet serve`; other backends — R2, S3, ... — are the app's own adapter, injected the same way a console asset source is, since a backend like R2 isn't resolvable from a plain config value). Uploading is two steps:

1. `POST /api/:model/:field/upload` (multipart, form field `file`) stores the blob and returns the reference.
2. That reference is sent as the field's own value on the normal `POST`/`PATCH /api/:model` call.

`accept` (a comma-separated list of mime types/`type/*` wildcards) is checked against the upload's *sniffed* bytes, never the client-declared Content-Type. `preview: 'image'` turns on thumbnail rendering in the console and defaults `accept` to `'image/*'` when `accept` is omitted. A record's own API response never exposes the raw storage `key` — it's rewritten to a `url` pointing at `GET /api/:model/:id/:field`, which streams the blob back after the same lookup `GET /api/:model/:id` does (so a soft-deleted record's file 404s too). Replacing a field's value deletes the old blob from storage after the write commits; a soft-removed record's files are left alone, matching how a soft-deleted row keeps its other data.

Only the `is` filter operator applies to a `file` field (`?filter=[["avatar","is",null]]` — has/doesn't have a file); there's no sort or equality, since the value is an object.

## Relations

A `field.reference(targetModel, opts)` column must have a key ending in `Id` (e.g. `customerId`) — that suffix lets `?include=` derive the relation name by stripping it:

```ts
export const Invoice = defineModel('invoices', {
  fields: {
    customerId: field.reference('customers', { required: true, indexed: true }),
    // ...
  },
});
```

```
GET /api/invoices?include=customer
```

Nested/dot-chained includes (`include=customer.company`) are rejected, not silently truncated.

## Operations

Every model gets `create`, `update`, and `remove` operations, each a [pipeline](/guide/pipelines). If you don't supply your own, the defaults are:

```ts
{
  create: pipe(validate, persist),
  update: pipe(validate, persist),
  remove: pipe(persist.remove),
}
```

Override any subset:

```ts
import { z } from 'zod';
import { defineModel, field, pipe, validate, persist } from '@egig/ratchet/core';
import { checkStock, applyDiscount, notify } from '../logic/invoice.js';

export const Invoice = defineModel('invoices', {
  fields: {
    customerId: field.reference('customers', { required: true, indexed: true }),
    amount: field.decimal({ precision: 10, scale: 2, required: true }),
    status: field.enum(['draft', 'sent', 'paid'], { default: 'draft', indexed: true }),
    notes: field.text({ required: false }),
    metadata: field.json({ schema: z.object({ source: z.string() }).optional() }),
  },
  operations: {
    create: pipe(validate, checkStock, applyDiscount, persist, notify),
    update: pipe(validate, checkStock, persist),
    remove: pipe(persist.remove),
  },
});
```

## Console options

```ts
interface ConsoleModelOptions {
  hidden?: boolean;      // excluded from the console sidebar and metadata endpoint entirely
  label?: string;         // sidebar/heading text; defaults to a capitalized `name`
  displayField?: string; // field shown in reference dropdowns and list titles; defaults to the first string field, or 'id'
}
```

See [Console](/guide/console) for how these are consumed — including how a model's folder location under `modelsDir` groups it into a Domain in the console sidebar.
