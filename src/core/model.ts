import type { FieldDefinition, ReferenceFieldDefinition } from './field.js';
import { pipe, validate, persist, type PipelineFn } from './pipeline.js';

export interface OperationsConfig {
  create: PipelineFn;
  update: PipelineFn;
  remove: PipelineFn;
  /** non-CRUD operations, e.g. `Workspace`'s `lock`/`unlock` (src/workspace/models/workspace.model.ts)
   * — undefined for every model that doesn't define one; `create-router.ts` 404s a request for one
   * that isn't present rather than assuming every model supports it. */
  lock?: PipelineFn;
  unlock?: PipelineFn;
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
  /** the Domain (see CONTEXT.md) this model belongs to — groups it under a labeled section in the
   * console sidebar, alongside every other model in the same Domain. Set by codegen from the
   * model's folder location (`models/auth/*.model.ts` -> `'auth'`, ADR 0001), not meant to be
   * hand-authored here. */
  domain?: string;
}

export interface ApiModelOptions {
  /** excluded from the generic `/api/:model` router entirely (every verb 404s, same as an
   * unknown model name) — for a model whose only legitimate access path is a dedicated,
   * auth-scoped router. `console.hidden` alone doesn't do this: it only hides a model from the
   * console sidebar/`/meta/models`, the model stays reachable at `/api/:model` regardless. Set on
   * `Chat`/`Message` (src/automation/models) because the generic router has no per-row ownership
   * check — only `Chat`/`Message`'s own `/api/automation/chats/*` router (src/automation/router.ts)
   * enforces that a chat and its messages are only readable by their owner. `Agent` stays generic-
   * REST-readable since it's shared config with no owner, the same as `Role`/`Permission`. */
  hidden?: boolean;
  /** names the field that must equal the requesting user's id for a row to be readable/writable
   * through the generic `/api/:model` router — the alternative to `hidden` for a model that *does*
   * have a natural per-row owner and still wants generic REST access (e.g. `Workspace`,
   * src/workspace/models). `create-router.ts`'s GET routes gate on it directly (auth + filter to
   * the session user's own rows); write routes still need a matching `requireOwnsRow(ownerField)`
   * step composed into the model's own `operations` pipeline (core/pipeline.ts) — this flag alone
   * doesn't touch POST/PATCH/DELETE. */
  ownerField?: string;
}

export interface ModelDefinition {
  /** also the table name and the REST route segment (§5 — no auto-pluralization) */
  name: string;
  tableName: string;
  fields: Record<string, FieldDefinition>;
  operations: OperationsConfig;
  console?: ConsoleModelOptions;
  api?: ApiModelOptions;
}

export interface DefineModelConfig {
  fields: Record<string, FieldDefinition>;
  operations?: Partial<OperationsConfig>;
  console?: ConsoleModelOptions;
  api?: ApiModelOptions;
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
    ...(config.operations?.lock ? { lock: config.operations.lock } : {}),
    ...(config.operations?.unlock ? { unlock: config.operations.unlock } : {}),
  };

  return { name, tableName: name, fields: config.fields, operations, console: config.console, api: config.api };
}
