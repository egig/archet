# Models & Fields

A model is defined once, with `defineModel()`, and drives everything else: the Postgres table, the Zod validators, the REST routes, and the admin panel.

```ts
import { defineModel, field } from 'arche/core';

export const Customer = defineModel('customers', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
    email: field.string({ required: true, unique: true, indexed: true, maxLength: 320 }),
  },
  admin: { displayField: 'name' },
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

### Common options

```ts
interface FieldCommonOptions<T> {
  required?: boolean;
  default?: T;
  unique?: boolean;
  indexed?: boolean;
  sensitive?: boolean;
  writeAs?: string;
}
```

- **`required`** and **`default`** are mutually exclusive — a field with a default is never absent, so declaring both throws at definition time.
- **`indexed`** gates whether a field can appear in `?filter=` or `?sort=` on the REST API (see [REST API](/guide/router)).
- **`sensitive`** marks a field as stored but stripped from every HTTP response — e.g. a password hash.
- **`writeAs`** is for a field written under a different, undeclared input key. For example, a `passwordHash` column declares `writeAs: 'password'` because a pipeline function (`hashPassword`) synthesizes the real column from a plaintext `password` key that never appears in `fields`. The admin form reads this to know which key to submit under.

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
import { defineModel, field, pipe, validate, persist } from 'arche/core';
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

## Admin options

```ts
interface AdminModelOptions {
  hidden?: boolean;      // excluded from the admin sidebar and metadata endpoint entirely
  label?: string;         // sidebar/heading text; defaults to a capitalized `name`
  displayField?: string; // field shown in reference dropdowns and list titles; defaults to 'id'
}
```

See [Admin Panel](/guide/admin) for how these are consumed.
