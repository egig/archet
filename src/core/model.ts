import type { FieldDefinition, ReferenceFieldDefinition } from './field.js';
import { pipe, validate, persist, type PipelineFn } from './pipeline.js';

export interface OperationsConfig {
  create: PipelineFn;
  update: PipelineFn;
  remove: PipelineFn;
}

export interface ConsoleModelOptions {
  /** excluded from the console sidebar and the `/meta/models` metadata endpoint entirely —
   * e.g. the built-in `Session` model, which is managed only through `/api/auth/*`. */
  hidden?: boolean;
  /** sidebar/heading text; defaults to a capitalized `name` when omitted. */
  label?: string;
  /** field key shown for a record in reference-field dropdowns and list-view titles; when
   * omitted, defaults to the first `string`-kind field declared on the model (e.g. `name` or
   * `title`), or 'id' if the model has no string field. */
  displayField?: string;
}

export interface ModelDefinition {
  /** also the table name and the REST route segment (§5 — no auto-pluralization) */
  name: string;
  tableName: string;
  fields: Record<string, FieldDefinition>;
  operations: OperationsConfig;
  console?: ConsoleModelOptions;
}

export interface DefineModelConfig {
  fields: Record<string, FieldDefinition>;
  operations?: Partial<OperationsConfig>;
  console?: ConsoleModelOptions;
}

function isReferenceField(f: FieldDefinition): f is ReferenceFieldDefinition {
  return f.kind === 'reference';
}

export function defineModel(name: string, config: DefineModelConfig): ModelDefinition {
  for (const [key, f] of Object.entries(config.fields)) {
    // Q5: relation naming convention — the FK column key must end in 'Id' so `?include=`
    // can derive the relation name by stripping the suffix.
    if (isReferenceField(f) && !key.endsWith('Id')) {
      throw new Error(
        `model '${name}': reference field '${key}' must have a key ending in 'Id' (e.g. 'customerId'), got '${key}'`,
      );
    }
  }

  const operations: OperationsConfig = {
    // §3: if `operations` is omitted (or a verb within it is), the default pipeline applies.
    create: config.operations?.create ?? pipe(validate, persist),
    update: config.operations?.update ?? pipe(validate, persist),
    remove: config.operations?.remove ?? pipe(persist.remove),
  };

  return { name, tableName: name, fields: config.fields, operations, console: config.console };
}
