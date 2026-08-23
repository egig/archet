import type { PgDatabase } from 'drizzle-orm/pg-core';
import { PipelineError, type PipelineFn } from '../core/pipeline.js';
import { hashPassword as hashPasswordValue } from './password.js';
import { findSessionByToken, findUserById, listPermissionsForRole, type UserRow } from './lookup.js';

type AnyDb = PgDatabase<any, any, any>;

function bearerToken(request: Request | undefined): string | null {
  const header = request?.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

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
  const token = bearerToken(request);
  if (!token) throw new PipelineError({ code: 'UNAUTHENTICATED', status: 401, message: 'missing bearer token' });

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
