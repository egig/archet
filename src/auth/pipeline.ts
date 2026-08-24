import type { PgDatabase } from 'drizzle-orm/pg-core';
import { PipelineError, type PipelineFn } from '../core/pipeline.js';
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

/** Requires `requireAuth` to have already run (`ctx.user` set), then checks the user's role owns
 * a permission matching `(resource, action)` — either side may be granted as `*`. */
export function requirePermission(resource: string, action: string): PipelineFn {
  return async (ctx) => {
    if (ctx.user === undefined) {
      throw new PipelineError({ code: 'UNAUTHENTICATED', status: 401, message: 'requirePermission run before requireAuth' });
    }
    const roleId = ctx.user?.roleId;
    const permissions = typeof roleId === 'string' ? await listPermissionsForRole(ctx.db, roleId) : [];

    const allowed = permissions.some(
      (p) => (p.resource === resource || p.resource === '*') && (p.action === action || p.action === '*'),
    );
    if (!allowed) {
      throw new PipelineError({
        code: 'FORBIDDEN',
        status: 403,
        message: `missing permission '${resource}:${action}'`,
      });
    }
    return ctx;
  };
}

/** Requires `ctx.registry` (set by the router — see `OperationContext.registry`). Checks that
 * `input.resource` names a real model in the registry and `input.action` names a real operation
 * on *some* model in the registry — or is the `*` wildcard, for either — since those are the only
 * values `requirePermission` treats as meaningful. `action`'s valid set is a registry-wide union
 * rather than being scoped to the chosen `resource`: every model's `operations` always has
 * exactly the same keys (`defineModel` fills in a default pipeline for any verb a model doesn't
 * declare), so there's no real per-resource variation to track, and scoping it would mean the
 * check runs after resource resolution instead of independently. A partial update that isn't
 * touching a given field is left alone (nothing new to validate on that field). */
export const requireValidPermissionTarget: PipelineFn = async (ctx) => {
  const resource = ctx.input.resource;
  const action = ctx.input.action;
  const resourceNeedsCheck = resource !== undefined && resource !== '*';
  const actionNeedsCheck = action !== undefined && action !== '*';
  if (!resourceNeedsCheck && !actionNeedsCheck) return ctx;

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
    const validActions = new Set(Object.values(ctx.registry).flatMap((model) => Object.keys(model.operations)));
    if (typeof action !== 'string' || !validActions.has(action)) {
      fields.action = `unknown action '${String(action)}' — must be a real operation name or '*'`;
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields });
  }
  return ctx;
};
