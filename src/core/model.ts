import type { FieldDefinition, ReferenceFieldDefinition } from './field.js';
import { pipe, validate, persist, type PipelineFn } from './pipeline.js';

/** Shows/hides a custom operation's console button based on the record's own current data — e.g.
 * a `lock` operation is only offered while `locked === false`. Evaluated client-side against the
 * row the console already has, since a `PipelineFn` can't cross the wire to the console SPA (see
 * `console/serialize-model.ts`) — this has to stay a small, JSON-serializable shape instead of
 * arbitrary code. Exactly one of `equals`/`notEquals`/`in` should be set. */
export interface OperationVisibilityRule {
  field: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: readonly unknown[];
}

/** Console-facing presentation for a custom operation — entirely optional; an operation with no
 * `console` block still renders (as a row-action button with a humanized-name label), this just
 * customizes it. Mirrors `ConsoleModelOptions`' role for a whole model. */
export interface OperationConsoleOptions {
  /** button label; defaults to the operation's key, humanized. */
  label?: string;
  /** `true` shows a generic "Are you sure?" browser confirm; a string is shown as the confirm
   * message instead. Omit for no confirmation. */
  confirm?: boolean | string;
  /** where the button appears. `'bulk'` only takes effect for a param-less operation (Q17: a
   * bulk-selected action re-invokes the single-record operation once per selected row, and there's
   * no console UI yet for collecting one set of params to apply to every row). Defaults to `['row']`. */
  placement?: readonly ('row' | 'detail' | 'bulk')[];
  visibleWhen?: OperationVisibilityRule;
}

/**
 * A developer-defined operation beyond the three builtins — the mechanism behind "convenient
 * actions" like a `lock`/`unlock` button that's really an `update` with a fixed field value (see
 * `presetFields()`, core/pipeline.ts). Lives as an extra key directly in a model's `operations`
 * object (`OperationsConfig`) rather than a separate map, so it's picked up for free everywhere
 * `Object.keys(model.operations)` already drives behavior: the console's operation list
 * (`operationNames`/`operations` in `console/serialize-model.ts`), the `actionRef` field's
 * dropdown (`console/client/fields.tsx`), and `requireValidPermissionTarget`'s action-name
 * validation (ratchet/auth). Dispatched by one generic route, `POST /:model/:id/:operation`
 * (router/create-router.ts) — always record-scoped, always POST, regardless of what `pipeline`
 * does internally.
 */
export interface CustomOperationDefinition {
  pipeline: PipelineFn;
  /** input params, declared with the same `field.*()` builder DSL as model fields — optional; a
   * paramless operation is a plain trigger (e.g. `lock`). When present, the console renders a
   * small modal form built from these before calling the operation. */
  params?: Record<string, FieldDefinition>;
  console?: OperationConsoleOptions;
}

/** A value in `OperationsConfig` beyond the three builtins: either a plain `PipelineFn` (a fully
 * custom operation with no params/console config) or a `CustomOperationDefinition` (adds params
 * and/or console presentation). */
export type OperationEntry = PipelineFn | CustomOperationDefinition;

/** Operation names no model may declare a custom operation under — `create`/`update`/`remove` are
 * the fixed builtin keys (typed separately below); `read` and `*` are reserved by the permission
 * system (`ratchet/auth`'s `requireValidPermissionTarget`); `upload` is reserved because
 * `POST /:model/:field/upload` (router/create-router.ts) already occupies that exact path shape
 * for models with a `file` field. */
export const RESERVED_OPERATION_NAMES: ReadonlySet<string> = new Set([
  'create',
  'update',
  'remove',
  'read',
  'upload',
  '*',
]);

export interface OperationsConfig {
  create: PipelineFn;
  update: PipelineFn;
  remove: PipelineFn;
  [operationName: string]: OperationEntry;
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
  /** opts this model out of the generic `/api/:model` router's implicit auth+permission gate
   * (every route on every model otherwise requires a matching `Permission` row, including reads —
   * see `ratchet/auth`) — for a model that's genuinely meant to be reachable with no session at
   * all, e.g. a public read-only catalog. `true` applies to every verb; there's no per-operation
   * granularity today. Doesn't affect a model's own hand-rolled router (`api.hidden`), which was
   * never subject to this gate in the first place. */
  public?: boolean;
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
  operations?: {
    create?: PipelineFn;
    update?: PipelineFn;
    remove?: PipelineFn;
  } & Record<string, OperationEntry>;
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
  };

  // Any other key in `operations` is a custom operation (Q11/Q19) — merged in as-is so
  // `Object.keys(model.operations)` picks it up everywhere that already enumerates operation
  // names (console metadata, the `actionRef` field, `requireValidPermissionTarget`).
  for (const [opName, entry] of Object.entries(config.operations ?? {})) {
    if (opName === 'create' || opName === 'update' || opName === 'remove') continue;
    if (RESERVED_OPERATION_NAMES.has(opName)) {
      throw new Error(`model '${name}': '${opName}' is a reserved operation name and can't be used for a custom operation`);
    }
    const def = typeof entry === 'function' ? undefined : entry;
    const placement = def?.console?.placement ?? ['row'];
    const hasParams = def?.params !== undefined && Object.keys(def.params).length > 0;
    if (placement.includes('bulk') && hasParams) {
      throw new Error(
        `model '${name}': custom operation '${opName}' can't combine placement 'bulk' with params — bulk-select only supports param-less operations (Q17)`,
      );
    }
    operations[opName] = entry as OperationEntry;
  }

  return { name, tableName: name, fields: config.fields, operations, console: config.console, api: config.api };
}
