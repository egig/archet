import { z, type ZodTypeAny } from 'zod';
import type { FieldDefinition } from './field.js';
import type { ModelDefinition } from './model.js';
import type { DomainDefinition } from './domain.js';

function baseSchemaForField(f: FieldDefinition): ZodTypeAny {
  switch (f.kind) {
    case 'string':
      return f.maxLength !== undefined ? z.string().max(f.maxLength) : z.string();
    case 'text':
      return z.string();
    case 'integer':
      return z.number().int();
    case 'decimal':
      // Q24: decimals round-trip as numeric strings, never JS `number`, to preserve precision.
      return z.string().regex(/^-?\d+(\.\d+)?$/, 'must be a decimal string, e.g. "129.99"');
    case 'boolean':
      return z.boolean();
    case 'datetime':
      return z.union([z.string(), z.date()]);
    case 'enum':
      return z.enum(f.values as [string, ...string[]]);
    case 'json':
      // Q14: an explicit, narrow exception — a user-supplied live Zod schema is referenced
      // directly rather than re-derived, since arbitrary Zod schemas can't be reconstructed here.
      return f.schema ?? z.record(z.unknown());
    case 'reference':
      return z.string().uuid();
    case 'modelRef':
    case 'actionRef':
      // intentionally not checked against the registry here — no live registry exists when a
      // model's static field definitions are built. The real check is
      // `requireValidPermissionTarget` (ratchet/auth), which runs per-request with `ctx.registry`.
      return z.string();
    case 'file':
      // the shape returned by the upload endpoint (see `router/create-router.ts`) and stored
      // as-is in the jsonb column — accept/maxSize/mime-sniffing are enforced at upload time,
      // not re-validated here.
      return z.object({
        key: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number().int().nonnegative(),
      });
  }
}

function fieldToZod(f: FieldDefinition): ZodTypeAny {
  const schema = baseSchemaForField(f);
  // Q13: a field with `default` is never required (field.ts already rejects required+default
  // together), so `required` is the only signal needed to decide optionality here.
  return f.required ? schema : schema.optional();
}

export function buildCreateSchema(model: ModelDefinition): ZodTypeAny {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, f] of Object.entries(model.fields)) {
    shape[key] = fieldToZod(f);
  }
  return z.object(shape);
}

export function buildUpdateSchema(model: ModelDefinition): ZodTypeAny {
  // Q2: update is PATCH-shaped — every field is optional, regardless of `required`.
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, f] of Object.entries(model.fields)) {
    shape[key] = baseSchemaForField(f).optional();
  }
  return z.object(shape);
}

/** Domain Settings are always patch-shaped (ADR 0002) — there's no create, only ever an update
 * against the one row a Domain has — so every field is optional here regardless of `required`,
 * same as `buildUpdateSchema`. */
export function buildDomainSettingsSchema(def: DomainDefinition): ZodTypeAny {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, f] of Object.entries(def.settingFields ?? {})) {
    shape[key] = baseSchemaForField(f).optional();
  }
  return z.object(shape);
}
