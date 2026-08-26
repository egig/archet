import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { OperationContext } from '../core/pipeline.js';
import { PipelineError } from '../core/pipeline.js';
import { redactSensitiveFields } from '../core/serialize.js';
import { generateId } from '../core/id.js';
import { insertRow } from '../core/persistence.js';
import { toErrorResponse } from '../router/errors.js';
import { readJsonBody } from '../router/create-router.js';
import { Workspace, DEFAULT_WORKSPACE_NAME } from '../workspace/index.js';
import { User, Role, Permission, registerPipeline } from './models/index.js';
import { resolveSessionUser } from './pipeline.js';
import {
  deleteSessionByToken,
  findRoleByName,
  findUserByEmail,
  hasRootAdmin,
  insertSession,
  listPermissionsForRole,
  type UserRow,
} from './lookup.js';
import { hashPassword as hashPasswordValue, verifyPassword } from './password.js';
import { generateToken, sessionExpiry } from './token.js';
import { resolveSessionToken, SESSION_COOKIE_NAME } from './cookie.js';

type AnyDb = PgDatabase<any, any, any>;

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { [key]: 'required' } });
  }
  return value;
}

async function issueSession(db: AnyDb, userId: string) {
  const token = generateToken();
  const now = new Date();
  const session = await insertSession(db, generateId(), userId, token, sessionExpiry(now), now);
  return session.token;
}

/** Mirrors the token onto an `HttpOnly` cookie so the console SPA (no manual header injection)
 * and non-browser API clients (the `Authorization` header, still returned in the body) both
 * work. `Secure` is conditional on the request's own protocol — hardcoding it on would break
 * plain-http `ratchet dev`. */
function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // matches SESSION_TTL_MS in token.ts
  });
}

function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
}

function redactUser(user: UserRow): Record<string, unknown> {
  return redactSensitiveFields(User, user as unknown as Record<string, unknown>);
}

async function userWithPermissions(db: AnyDb, user: UserRow): Promise<Record<string, unknown>> {
  const permissions = typeof user.roleId === 'string' ? await listPermissionsForRole(db, user.roleId) : [];
  return { ...redactUser(user), permissions };
}

const ROOT_ROLE_NAME = 'Root';

/** `/api/auth/*` — setup/register/login/logout/me. Mount before the generic `/api/:model`
 * router (src/router/create-router.ts) so this more specific prefix wins. */
export function createAuthRouter(db: AnyDb): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as never);
  });

  app.get('/setup', async (c) => {
    return c.json({ data: { required: !(await hasRootAdmin(db)) } });
  });

  /** One-time bootstrap: creates the first user with unrestricted (`*:*`) access, so a fresh
   * instance has a way in without a DB console. Unauthenticated, but self-gating — re-checks
   * `hasRootAdmin` inside the transaction so a concurrent double-submit can't create two. Becomes
   * a permanent 409 once any user holds `*:*`, regardless of that user's `active` state (see
   * `hasRootAdmin`'s doc comment). */
  app.post('/setup', async (c) => {
    const body = await readJsonBody(c);
    const email = requireString(body, 'email');
    const password = requireString(body, 'password');

    const user = await db.transaction(async (tx) => {
      const txDb = tx as AnyDb;
      if (await hasRootAdmin(txDb)) {
        throw new PipelineError({ code: 'SETUP_ALREADY_COMPLETE', status: 409, message: 'a root admin already exists' });
      }

      const role = (await findRoleByName(txDb, ROOT_ROLE_NAME)) ?? (await insertRow(txDb, Role, { name: ROOT_ROLE_NAME }));
      const permissions = await listPermissionsForRole(txDb, role.id as string);
      if (!permissions.some((p) => p.resource === '*' && p.action === '*')) {
        // `field: '*'` isn't optional here even though `action: '*'` already implies every
        // fieldless action (remove/lock/unlock) — `requireValidPermissionTarget` still requires an
        // explicit field value for the field-shaped actions ('*' covers read/create/update too).
        // Without it, secure-by-default field permission (docs/guide/auth.md) would brick the
        // console immediately after setup: the root admin could log in but see/write no fields on
        // any model, with no way to grant the first field permission.
        await insertRow(txDb, Permission, { roleId: role.id, resource: '*', action: '*', field: '*' });
      }

      const created = await insertRow(txDb, User, { email, passwordHash: await hashPasswordValue(password), roleId: role.id });
      // root admin has no workTitleId (there's no WorkTitle yet on a fresh instance), so this is
      // always the blank default — see `workspace/provisioning.ts`'s `createDefaultWorkspace`,
      // which this mirrors for the one user-creation path that doesn't run through a pipe().
      await insertRow(txDb, Workspace, { userId: created.id, name: DEFAULT_WORKSPACE_NAME });
      return created;
    });

    const token = await issueSession(db, user.id as string);
    setSessionCookie(c, token);
    return c.json({ data: { user: redactSensitiveFields(User, user), token } }, 201);
  });

  app.post('/register', async (c) => {
    const body = await readJsonBody(c);
    const input = { email: requireString(body, 'email'), password: requireString(body, 'password') };

    const ctx: OperationContext = { operation: 'create', input, doc: null, model: User, db, request: c.req.raw };
    const result = await registerPipeline(ctx);
    const doc = result.doc!;

    const token = await issueSession(db, doc.id as string);
    setSessionCookie(c, token);
    return c.json({ data: { user: redactSensitiveFields(User, doc), token } }, 201);
  });

  app.post('/login', async (c) => {
    const body = await readJsonBody(c);
    const email = requireString(body, 'email');
    const password = requireString(body, 'password');

    const user = await findUserByEmail(db, email);
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !user.active || !valid) {
      throw new PipelineError({ code: 'INVALID_CREDENTIALS', status: 401 });
    }

    const token = await issueSession(db, user.id);
    setSessionCookie(c, token);
    return c.json({ data: { user: redactUser(user), token } });
  });

  app.post('/logout', async (c) => {
    const token = resolveSessionToken(c.req.raw);
    if (!token) {
      throw new PipelineError({ code: 'UNAUTHENTICATED', status: 401, message: 'missing bearer token or session cookie' });
    }
    await deleteSessionByToken(db, token);
    clearSessionCookie(c);
    return c.json({ data: null });
  });

  app.get('/me', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    return c.json({ data: await userWithPermissions(db, user) });
  });

  return app;
}
