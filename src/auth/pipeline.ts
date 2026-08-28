import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition } from '../core/model.js';
import { pipe, validate, persist, PipelineError, type PipelineFn } from '../core/pipeline.js';
import { insertRow, listRowsByField, softRemoveRow } from '../core/persistence.js';
import { hashPassword as hashPasswordValue } from './password.js';
import { findSessionByToken, findUserById, listPermissionsForRole, type UserRow } from './lookup.js';
import { resolveSessionToken } from './cookie.js';

type AnyDb = PgDatabase<any, any, any>;

/** If `ctx.input.password` (plaintext) is present, replaces it with the model's real
 * `passwordHash` column before `validate` runs — a no-op when there's nothing to hash (e.g. a
 * `PATCH` that isn't touching the password). */
export const hashPassword: PipelineFn = async (ctx) => {
  const { password, ...rest } = ctx.input;
  if (typeof password !== 'string') return ctx;
  return { ...ctx, input: { ...rest, passwordHash: await hashPasswordValue(password) } };
};

/** Resolves a `Bearer` token to a live session + active user. Shared by the `requireAuth`
 * pipeline fn and the plain Hono handlers in `src/auth/router.ts` (e.g. `GET /me`) so both paths
 * apply the exact same session/expiry/active checks. Throws 401 UNAUTHENTICATED otherwise. */
export async function resolveSessionUser(db: AnyDb, request: Request | undefined): Promise<UserRow> {
  const token = resolveSessionToken(request);
  if (!token) throw new PipelineError({ code: 'UNAUTHENTICATED', status: 401, message: 'missing bearer token or session cookie' });

  const session = await findSessionByToken(db, token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new PipelineError({ code: 'UNAUTHENTICATED', status: 401, message: 'invalid or expired session' });
  }

  const user = await findUserById(db, session.userId);
  if (!user || !user.active) {
    throw new PipelineError({ code: 'UNAUTHENTICATED', status: 401, message: 'invalid or expired session' });
  }

  return user;
}

/** Resolves the bearer token on `ctx.request` to a live session + user, stashing the user on
 * `ctx.user` for `requirePermission`/business logic. Throws 401 UNAUTHENTICATED otherwise. */
export const requireAuth: PipelineFn = async (ctx) => {
  const user = await resolveSessionUser(ctx.db, ctx.request);
  return { ...ctx, user: user as unknown as Record<string, unknown> };
};

function permissionAllows(permissions: { resource: string; action: string }[], resource: string, action: string): boolean {
  return permissions.some((p) => (p.resource === resource || p.resource === '*') && (p.action === action || p.action === '*'));
}

/** Requires `requireAuth` to have already run (`ctx.user` set), then checks the user's role owns
 * a permission matching `(resource, action)` — either side may be granted as `*`. Kept as a
 * pipeline fn (rather than being replaced outright by `authorizeRequest`) for library consumers
 * composing their own custom operations — the generic `/api/:model` router no longer needs a model
 * author to wire this in themselves, since it now applies implicitly (see `authorizeRequest`,
 * called directly by `create-router.ts` before a model's own pipeline ever runs). */
export function requirePermission(resource: string, action: string): PipelineFn {
  return async (ctx) => {
    if (ctx.user === undefined) {
      throw new PipelineError({ code: 'UNAUTHENTICATED', status: 401, message: 'requirePermission run before requireAuth' });
    }
    const roleId = ctx.user?.roleId;
    const permissions = typeof roleId === 'string' ? await listPermissionsForRole(ctx.db, roleId) : [];
    if (!permissionAllows(permissions, resource, action)) {
      throw new PipelineError({ code: 'FORBIDDEN', status: 403, message: `missing permission '${resource}:${action}'` });
    }
    return ctx;
  };
}

/** Router-level counterpart to `requirePermission`, for routes that never build an
 * `OperationContext` at all — the generic router's `GET` list/detail routes have no per-model
 * `read` operation to compose a pipeline fn into (unlike create/update/remove), so the
 * implicit read gate (`create-router.ts`) calls this directly instead. Resolves the session user
 * and checks their role holds `(resource, action)` — either side may be `*` — the same rule
 * `requirePermission` enforces. Throws 401 (no/expired session) or 403 (session valid, permission
 * missing), same codes as `requirePermission`. */
export async function authorizeRequest(db: AnyDb, request: Request | undefined, resource: string, action: string): Promise<UserRow> {
  const user = await resolveSessionUser(db, request);
  const permissions = typeof user.roleId === 'string' ? await listPermissionsForRole(db, user.roleId) : [];
  if (!permissionAllows(permissions, resource, action)) {
    throw new PipelineError({ code: 'FORBIDDEN', status: 403, message: `missing permission '${resource}:${action}'` });
  }
  return user;
}

export type GrantedFields = '*' | ReadonlySet<string>;

/** The field-level counterpart to `requirePermission`/`authorizeRequest`'s resource:action check —
 * resolves which fields of `resource` a role may touch/see for a field-shaped `action`
 * (`'read'`/`'create'`/`'update'`; meaningless for `'remove'`, which doesn't gate individual
 * fields at all). Unions every matching `Permission` row's `field` (the row's own
 * `resource`/`action` sides may each independently be `'*'`); any matching row with `field: '*'`
 * short-circuits to "every field." Secure-by-default (no backward-compat carve-out, ADR-less
 * breaking change at v0.1.0): a role with *no* matching field-scoped row gets an empty set, not
 * "everything" — see docs/guide/auth.md. */
export async function resolveGrantedFields(
  db: AnyDb,
  roleId: string | null | undefined,
  resource: string,
  action: string,
): Promise<GrantedFields> {
  const permissions = typeof roleId === 'string' ? await listPermissionsForRole(db, roleId) : [];
  const matching = permissions.filter(
    (p) => (p.resource === resource || p.resource === '*') && (p.action === action || p.action === '*'),
  );
  if (matching.some((p) => p.field === '*')) return '*';
  return new Set(matching.map((p) => p.field).filter((f): f is string => typeof f === 'string'));
}

/** Strips every `model.fields` key not in `granted` from `row` — used at every read boundary that
 * enforces field-level permission (the generic router's `GET` routes, `create-router.ts`; agent
 * tool-call output would need the same treatment if it's ever read-gated too). Auto-injected
 * system columns (`id`/`createdAt`/`updatedAt`/`deletedAt`/`createdById`) aren't in `model.fields`
 * at all, so this loop never reaches them — deliberately exempt, see docs/guide/auth.md. */
export function pickGrantedFields(model: ModelDefinition, row: Record<string, unknown>, granted: GrantedFields): Record<string, unknown> {
  if (granted === '*') return row;
  const out = { ...row };
  for (const key of Object.keys(model.fields)) {
    if (!granted.has(key)) delete out[key];
  }
  return out;
}

/** Maps a raw write-input key back to the `model.fields` key it actually writes — mainly for
 * `writeAs` (e.g. `User`'s `password` input key writes the real `passwordHash` field), so a role
 * denied write access to `passwordHash` can't route around that denial through its `writeAs`
 * alias. A key that isn't a real field at all resolves to `undefined` and is ignored by
 * `assertWriteFieldsAllowed` — `validate`'s schema silently strips it same as always. */
export function fieldKeyForInput(model: ModelDefinition, inputKey: string): string | undefined {
  if (inputKey in model.fields) return inputKey;
  return Object.entries(model.fields).find(([, f]) => f.writeAs === inputKey)?.[0];
}

/** Rejects the whole write (naming every offending key) if `input` touches a field outside
 * `granted` — used at every write boundary that enforces field-level permission: the generic
 * router's `POST`/`PATCH` (`create-router.ts`) and builtin agent tool calls (`automation/tool.ts`'s
 * `executeAgentTool`, which invokes a model's `create`/`update` pipeline exactly like the
 * REST route does and needs the identical check). Rejects rather than silently dropping disallowed
 * keys, so a caller's local state never disagrees with the server about what actually got written. */
export function assertWriteFieldsAllowed(model: ModelDefinition, input: Record<string, unknown>, granted: GrantedFields): void {
  if (granted === '*') return;
  const fields: Record<string, string> = {};
  for (const inputKey of Object.keys(input)) {
    const fieldKey = fieldKeyForInput(model, inputKey);
    if (fieldKey && !granted.has(fieldKey)) fields[inputKey] = 'field not permitted for your role';
  }
  if (Object.keys(fields).length > 0) throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields });
}

/**
 * The sugar helper behind a "convenient action" custom operation (core/model.ts's
 * `CustomOperationDefinition`) — e.g. `lock: presetFields({ locked: true })` is a whole `update`-
 * shaped write, minus having to hand-write one. Merges `values` on top of whatever's already in
 * `ctx.input` (a param-taking custom operation's already-validated params, or nothing for a plain
 * trigger like `lock`), checks the *combined* set against the caller's field-write permission for
 * `permissionAction` (default `'update'`) exactly as the generic router does for a real `PATCH`,
 * then runs it through the same `validate`+`persist` any `update` operation uses.
 *
 * This is deliberately *not* a bypass: per Q4/Q10, a custom operation's own action-level grant
 * (`resource:lock`) only gets you in the door — actually writing `locked` still needs the base
 * operation's own field grant (`resource:update` + `field:locked`), the same as if the caller had
 * PATCHed it directly. Must run where `ctx.user` is already set (i.e. after the router's own
 * resource-level authorization, which every custom-operation call already goes through — see
 * `create-router.ts`) so the right role's grants are resolved. `model.api?.public` skips the
 * check entirely, same carve-out `resolveFieldAccess` (create-router.ts) applies for a public
 * model's own create/update — there's no role to scope a grant by.
 */
export function presetFields(values: Record<string, unknown>, opts: { permissionAction?: string } = {}): PipelineFn {
  const permissionAction = opts.permissionAction ?? 'update';
  return async (ctx) => {
    const merged = { ...ctx.input, ...values };
    if (!ctx.model.api?.public) {
      const roleId = (ctx.user as { roleId?: string } | null | undefined)?.roleId;
      const granted = await resolveGrantedFields(ctx.db, roleId, ctx.model.name, permissionAction);
      assertWriteFieldsAllowed(ctx.model, merged, granted);
    }
    return pipe(validate, persist)({ ...ctx, input: merged });
  };
}

/** Actions that don't gate individual field values at all — currently just `remove`, which
 * deletes the whole row. A `Permission` row scoped to one of these must never carry a `field`
 * value. (Kept as a set so adding another whole-row action later is a one-line change.) */
export const FIELDLESS_ACTIONS: ReadonlySet<string> = new Set(['remove']);

/** The closed set of actions with a field-shaped permission concept at all. Everything else —
 * `remove`, and every developer-defined custom operation (core/model.ts's
 * `CustomOperationDefinition`, an open-ended, per-app vocabulary `FIELDLESS_ACTIONS` can't
 * enumerate) — is fieldless by default: a `Permission` row for it must never carry a `field`
 * value. A custom operation that does write specific fields (e.g. `presetFields()` below) gates
 * those separately, against its own field-shaped `update`-style action — not against its own
 * operation name — so e.g. `resource:lock` stays a whole-action grant while the actual `locked`
 * write still needs `resource:update` + `field:locked` (Q10). */
const FIELD_SHAPED_ACTIONS: ReadonlySet<string> = new Set(['read', 'create', 'update']);

/** Requires `ctx.registry` (set by the router — see `OperationContext.registry`). Checks that
 * `input.resource` names a real model in the registry and `input.action` names a real operation
 * on *some* model in the registry, or is the built-in implicit `'read'` action (see
 * `create-router.ts`'s `GET` routes — there's no per-model `read` operation key to derive this
 * from the way there is for create/update/remove) — or is the `*` wildcard, for
 * either — since those are the only values `requirePermission` treats as meaningful. `action`'s
 * valid set is a registry-wide union rather than being scoped to the chosen `resource`: every
 * model's `operations` always has the three builtin keys plus whichever custom operations it
 * declares (core/model.ts's `CustomOperationDefinition`), so scoping this to one resource would
 * mean the check runs after resource resolution instead of independently, for a distinction
 * (`resource`'s own valid-name check already runs regardless) that doesn't buy much.
 *
 * `field`'s requiredness is a cross-field constraint `field.ts`'s static `required` flag can't
 * express — it depends on the row's own *effective* `action` (required for `read`/`create`/
 * `update`/`*`, forbidden for `remove` and every custom operation — see `FIELD_SHAPED_ACTIONS`),
 * so it's enforced here instead, against
 * whichever of `input`/`ctx.doc` last set each of `resource`/`action`/`field` — a partial update
 * that isn't touching any of the three is left alone entirely. Only applies at all when
 * `ctx.model` actually declares a `field.fieldRef()` column named `field` — `Permission` does,
 * `AgentPermission` (same `requireValidPermissionTarget` call, no field-level concept at all)
 * doesn't, and must be completely unaffected by field-requiredness. */
export const requireValidPermissionTarget: PipelineFn = async (ctx) => {
  const hasFieldColumn = ctx.model.fields.field?.kind === 'fieldRef';
  const resource = ctx.input.resource;
  const action = ctx.input.action;
  const field = hasFieldColumn ? ctx.input.field : undefined;
  const resourceNeedsCheck = resource !== undefined && resource !== '*';
  const actionNeedsCheck = action !== undefined && action !== '*';
  if (resource === undefined && action === undefined && field === undefined) return ctx;

  if (!ctx.registry) {
    throw new PipelineError({
      code: 'INTERNAL',
      status: 500,
      message: 'requireValidPermissionTarget requires ctx.registry',
    });
  }

  const fields: Record<string, string> = {};

  if (resourceNeedsCheck && (typeof resource !== 'string' || !(resource in ctx.registry))) {
    fields.resource = `unknown resource '${String(resource)}' — must be a registered model name or '*'`;
  }

  if (actionNeedsCheck) {
    const validActions = new Set(['read', ...Object.values(ctx.registry).flatMap((model) => Object.keys(model.operations))]);
    if (typeof action !== 'string' || !validActions.has(action)) {
      fields.action = `unknown action '${String(action)}' — must be a real operation name, 'read', or '*'`;
    }
  }

  // Only cross-check `field` once `resource`/`action` are themselves known-valid — an invalid
  // action makes "is field required for it" unanswerable. Skipped entirely for a model with no
  // `field` column at all (e.g. `AgentPermission`).
  if (hasFieldColumn && fields.resource === undefined && fields.action === undefined) {
    const effectiveAction: string | undefined = typeof action === 'string' ? action : typeof ctx.doc?.action === 'string' ? ctx.doc.action : undefined;
    const effectiveResource: string | undefined =
      typeof resource === 'string' ? resource : typeof ctx.doc?.resource === 'string' ? ctx.doc.resource : undefined;
    const effectiveField = field !== undefined ? field : ctx.doc?.field;

    if (effectiveAction !== undefined) {
      const fieldApplicable = effectiveAction === '*' || FIELD_SHAPED_ACTIONS.has(effectiveAction);

      if (!fieldApplicable) {
        if (effectiveField !== undefined && effectiveField !== null) {
          fields.field = `not applicable for action '${effectiveAction}' — it doesn't gate individual fields, leave 'field' unset`;
        }
      } else if (effectiveField === undefined || effectiveField === null || effectiveField === '') {
        fields.field = `required for action '${effectiveAction}' — name a field, or '*' for every field`;
      } else if (typeof effectiveField === 'string' && effectiveField !== '*') {
        if (effectiveResource === '*') {
          fields.field = `must be '*' when resource is '*' — a concrete field can't be checked against every model`;
        } else if (typeof effectiveResource === 'string') {
          const targetModel = ctx.registry[effectiveResource];
          if (!targetModel || !(effectiveField in targetModel.fields)) {
            fields.field = `unknown field '${effectiveField}' on resource '${effectiveResource}'`;
          }
        }
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields });
  }
  return ctx;
};

/** One desired grant, the shape `Role`'s `setPermissions` custom operation (below) takes a list of
 * — mirrors a `Permission` row's own `resource`/`action`/`field` triple minus `roleId` (implied by
 * which role the operation was called on) and the row's own `id` (this is a declarative "this is
 * the whole desired set," not a patch to an existing row). */
export interface PermissionTarget {
  resource: string;
  action: string;
  field?: string | null;
}

/** Builds the same collapsed key `setRolePermissions` diffs by — two targets naming the same
 * `(resource, action, field)` triple are the same grant regardless of object identity. `field`
 * is normalized to `''` so a fieldless grant (e.g. `remove`, or a custom operation) and one
 * explicitly carrying `field: null`/`undefined` collapse to the same key. */
function permissionTargetKey(target: PermissionTarget): string {
  return `${target.resource} ${target.action} ${target.field ?? ''}`;
}

/** The pipeline fn behind `Role`'s `setPermissions` custom operation (`role.model.ts`) — the
 * mechanism behind the console's combined "edit role + manage its permissions" form (a
 * tree-of-checkboxes over every registered resource/action/field, `*` collapsing a whole subtree
 * into one wildcard row). Takes the *entire* desired grant list for this role in one call and
 * diffs it against the role's current `Permission` rows — inserting what's newly granted,
 * soft-removing what's no longer there — the same "desired set, not a patch" shape
 * `syncManyToMany` (core/pipeline.ts) diffs a manyToMany field's target ids against its junction
 * rows. Wrapped in `pipe()` (see `setRolePermissions` below) so the whole diff commits atomically
 * and `ctx.doc` still auto-prefetches to the role being edited, the same as any other operation.
 *
 * Gated by two independent checks, mirroring the "two independent checks" a `presetFields`-based
 * operation needs (docs/guide/custom-operations.md#permissions): the router's own resource-level
 * check already required `roles:setPermissions` to reach this pipeline at all; the field-grant
 * check below is this operation's field-grant-shaped counterpart — reusing `resolveGrantedFields`/
 * `assertWriteFieldsAllowed`, the exact pair a direct `POST /permissions` is gated by, since the
 * actual write here is a `Permission` row rather than one of `Role`'s own fields (there's no single
 * `field` to gate the way `presetFields` gates `locked` — a `Permission` row's `resource`/`action`/
 * `field` columns are checked together). A role trusted to grant permissions is trusted to revoke
 * them too, so one check covers both the inserts and the soft-removes below.
 */
const syncRolePermissions: PipelineFn = async (ctx) => {
  if (!ctx.registry) {
    throw new PipelineError({ code: 'INTERNAL', status: 500, message: 'setPermissions requires ctx.registry' });
  }
  if (!ctx.id) throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
  const permissionModel = ctx.registry.permissions;
  if (!permissionModel) {
    throw new PipelineError({ code: 'INTERNAL', status: 500, message: "setPermissions requires a registered 'permissions' model" });
  }

  if (!permissionModel.api?.public) {
    const roleId = (ctx.user as { roleId?: string } | null | undefined)?.roleId;
    const granted = await resolveGrantedFields(ctx.db, roleId, 'permissions', 'create');
    assertWriteFieldsAllowed(permissionModel, { roleId: null, resource: null, action: null, field: null }, granted);
  }

  const targets = ((ctx.input.targets as PermissionTarget[] | undefined) ?? []).map((t) => ({ ...t, field: t.field ?? undefined }));
  for (const [index, target] of targets.entries()) {
    try {
      await requireValidPermissionTarget({ ...ctx, model: permissionModel, input: target, doc: null });
    } catch (err) {
      if (err instanceof PipelineError && err.fields) {
        const fields: Record<string, string> = {};
        for (const [key, message] of Object.entries(err.fields)) fields[`targets.${index}.${key}`] = message;
        throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields });
      }
      throw err;
    }
  }

  const desired = new Map(targets.map((t) => [permissionTargetKey(t), t]));
  const current = await listRowsByField(ctx.db, permissionModel, 'roleId', ctx.id);
  const currentByKey = new Map(
    current.map((row) => [
      permissionTargetKey({ resource: row.resource as string, action: row.action as string, field: row.field as string | null }),
      row,
    ]),
  );

  const createdById = (ctx.user as { id?: string } | null | undefined)?.id ?? null;
  for (const [key, target] of desired) {
    if (!currentByKey.has(key)) {
      await insertRow(ctx.db, permissionModel, { roleId: ctx.id, resource: target.resource, action: target.action, field: target.field ?? null }, createdById);
    }
  }
  for (const [key, row] of currentByKey) {
    if (!desired.has(key)) {
      await softRemoveRow(ctx.db, permissionModel, row.id as string);
    }
  }

  return ctx;
};

/** `pipe()`-wrapped so `Role`'s `setPermissions` operation gets the same transactional
 * auto-prefetch every other operation does (see `core/pipeline.ts`'s `pipe()`) even though its
 * own writes never touch `Role`'s own row. */
export const setRolePermissions: PipelineFn = pipe(syncRolePermissions);
