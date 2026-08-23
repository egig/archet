import type { FieldDefinition, ReferenceFieldDefinition } from './field.js';
import { pipe, validate, persist, type PipelineFn } from './pipeline.js';

export interface OperationsConfig {
  create: PipelineFn;
  update: PipelineFn;
  remove: PipelineFn;
}

export interface ModelDefinition {
  /** also the table name and the REST route segment (§5 — no auto-pluralization) */
  name: string;
  tableName: string;
  fields: Record<string, FieldDefinition>;
  operations: OperationsConfig;
}

export interface DefineModelConfig {
  fields: Record<string, FieldDefinition>;
  operations?: Partial<OperationsConfig>;
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

  return { name, tableName: name, fields: config.fields, operations };
}
