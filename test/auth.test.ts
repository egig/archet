import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { defineModel, field } from '../src/core/index.js';
import { generateId } from '../src/core/id.js';
import type { OperationContext } from '../src/core/pipeline.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { hashPassword as hashPasswordPipeline } from '../src/auth/pipeline.js';
import { User, Role, Permission, Session } from '../src/auth/models/index.js';
import { createAuthRouter } from '../src/auth/router.js';
import { createApiRouter } from '../src/router/create-router.js';
import { createAdminRouter } from '../src/admin/router.js';

describe('password hashing (src/auth/password.ts)', () => {
  it('hashes and verifies a round trip', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('right one');
    expect(await verifyPassword('wrong one', hash)).toBe(false);
  });
});

describe('hashPassword pipeline fn (src/auth/pipeline.ts)', () => {
  function ctx(input: Record<string, unknown>): OperationContext {
    return { operation: 'create', input, doc: null, model: User, db: {} as never };
  }

  it('replaces a plaintext `password` with a `passwordHash`', async () => {
    const result = await hashPasswordPipeline(ctx({ email: 'a@b.com', password: 'hunter2' }));
    expect(result.input.password).toBeUndefined();
    expect(typeof result.input.passwordHash).toBe('string');
    expect(await verifyPassword('hunter2', result.input.passwordHash as string)).toBe(true);
  });

  it('is a no-op when there is no `password` to hash', async () => {
    const input = { email: 'a@b.com' };
    const result = await hashPasswordPipeline(ctx(input));
    expect(result.input).toEqual(input);
  });
});

const connectionString = process.env.DATABASE_URL;
const describeIfDb = connectionString ? describe : describe.skip;

describeIfDb('auth system (against a live Postgres)', () => {
  let client: postgres.Sql;
  let db: PgDatabase<any, any, any>;
  let authApp: ReturnType<typeof createAuthRouter>;
  let apiApp: ReturnType<typeof createApiRouter>;
  let adminApp: ReturnType<typeof createAdminRouter>;

  const Widget = defineModel('widgets', {
    fields: {
      name: field.string({ required: true }),
      ownerId: field.reference('users', { required: false }),
    },
    admin: { label: 'Widgets', displayField: 'name' },
  });

  beforeAll(async () => {
    client = postgres(connectionString!);
    db = drizzle(client) as unknown as PgDatabase<any, any, any>;

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS roles (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
        name varchar NOT NULL, description text
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS permissions (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
        role_id uuid NOT NULL, resource varchar NOT NULL, action varchar NOT NULL
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
        email varchar NOT NULL, password_hash varchar NOT NULL, role_id uuid, active boolean NOT NULL DEFAULT true
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
        user_id uuid NOT NULL, token varchar NOT NULL, expires_at timestamptz NOT NULL
      )`);

    authApp = createAuthRouter(db);
    apiApp = createApiRouter({ roles: Role, permissions: Permission, users: User }, db);
    adminApp = createAdminRouter(
      '.ratchet-test',
      { users: User, roles: Role, permissions: Permission, sessions: Session, widgets: Widget },
      db,
    );
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE sessions, permissions, users, roles`);
  });

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS sessions`);
    await db.execute(sql`DROP TABLE IF EXISTS users`);
    await db.execute(sql`DROP TABLE IF EXISTS permissions`);
    await db.execute(sql`DROP TABLE IF EXISTS roles`);
    await client.end();
  });

  async function registerUser(email: string, password: string) {
    const res = await authApp.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = (await res.json()) as { data: { user: Record<string, unknown>; token: string } };
    return { res, ...body.data };
  }

  describe('root admin onboarding (src/auth/router.ts POST/GET /setup)', () => {
    it('GET /setup reports required until a root admin is created, then never again', async () => {
      const before = await authApp.request('/setup');
      expect(((await before.json()) as { data: { required: boolean } }).data.required).toBe(true);

      const create = await authApp.request('/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'root@example.com', password: 'hunter2' }),
      });
      expect(create.status).toBe(201);

      const after = await authApp.request('/setup');
      expect(((await after.json()) as { data: { required: boolean } }).data.required).toBe(false);
    });

    it('the created user can immediately act on any resource (roles:create) with no prior grant', async () => {
      const setup = await authApp.request('/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'root2@example.com', password: 'hunter2' }),
      });
      const { token } = ((await setup.json()) as { data: { token: string } }).data;

      const res = await apiApp.request('/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'editor' }),
      });
      expect(res.status).toBe(201);
    });

    it('a second setup attempt 409s once a root admin exists', async () => {
      await authApp.request('/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'root3@example.com', password: 'hunter2' }),
      });

      const second = await authApp.request('/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'someone-else@example.com', password: 'hunter2' }),
      });
      expect(second.status).toBe(409);
      expect(((await second.json()) as { error: { code: string } }).error.code).toBe('SETUP_ALREADY_COMPLETE');
    });

    it('deactivating the root admin does not reopen setup', async () => {
      const setup = await authApp.request('/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'root4@example.com', password: 'hunter2' }),
      });
      const { user } = ((await setup.json()) as { data: { user: { id: string } } }).data;

      await db.execute(sql`UPDATE users SET active = false WHERE id = ${user.id}`);

      const status = await authApp.request('/setup');
      expect(((await status.json()) as { data: { required: boolean } }).data.required).toBe(false);
    });

    it('reuses the same Root role + *:* permission on a fresh instance instead of duplicating it', async () => {
      await authApp.request('/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'root5@example.com', password: 'hunter2' }),
      });

      const roles = (await db.execute(sql`SELECT id FROM roles WHERE name = 'Root'`)) as unknown as unknown[];
      expect(roles.length).toBe(1);
      const permissions = (await db.execute(
        sql`SELECT id FROM permissions WHERE resource = '*' AND action = '*'`,
      )) as unknown as unknown[];
      expect(permissions.length).toBe(1);
    });
  });

  it('register creates a user + session and never returns passwordHash', async () => {
    const { res, user, token } = await registerUser('ada@example.com', 'hunter2');
    expect(res.status).toBe(201);
    expect(user.email).toBe('ada@example.com');
    expect(user.passwordHash).toBeUndefined();
    expect(typeof token).toBe('string');
  });

  it('login succeeds with the right password and fails with the wrong one', async () => {
    await registerUser('grace@example.com', 'right-password');

    const good = await authApp.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'grace@example.com', password: 'right-password' }),
    });
    expect(good.status).toBe(200);
    const goodBody = (await good.json()) as { data: { token: string } };
    expect(typeof goodBody.data.token).toBe('string');

    const bad = await authApp.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'grace@example.com', password: 'nope' }),
    });
    expect(bad.status).toBe(401);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /me requires a valid bearer token and reflects the logged-in user', async () => {
    const { token } = await registerUser('me@example.com', 'pw');

    const noAuth = await authApp.request('/me');
    expect(noAuth.status).toBe(401);

    const authed = await authApp.request('/me', { headers: { authorization: `Bearer ${token}` } });
    expect(authed.status).toBe(200);
    const body = (await authed.json()) as { data: { email: string } };
    expect(body.data.email).toBe('me@example.com');
  });

  it('logout invalidates the session', async () => {
    const { token } = await registerUser('bye@example.com', 'pw');

    const before = await authApp.request('/me', { headers: { authorization: `Bearer ${token}` } });
    expect(before.status).toBe(200);

    const logout = await authApp.request('/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    expect(logout.status).toBe(200);

    const after = await authApp.request('/me', { headers: { authorization: `Bearer ${token}` } });
    expect(after.status).toBe(401);
  });

  it('GET /me includes the resolved permissions for the caller\'s role', async () => {
    const { token, user } = await registerUser('perms@example.com', 'pw');

    const noRole = await authApp.request('/me', { headers: { authorization: `Bearer ${token}` } });
    expect(((await noRole.json()) as { data: { permissions: unknown[] } }).data.permissions).toEqual([]);

    const roleId = generateId();
    const now = new Date().toISOString();
    await db.execute(sql`INSERT INTO roles (id, created_at, updated_at, name) VALUES (${roleId}, ${now}, ${now}, 'viewer')`);
    await db.execute(
      sql`INSERT INTO permissions (id, created_at, updated_at, role_id, resource, action)
          VALUES (${generateId()}, ${now}, ${now}, ${roleId}, 'invoices', 'list')`,
    );
    await db.execute(sql`UPDATE users SET role_id = ${roleId} WHERE id = ${user.id}`);

    const withRole = await authApp.request('/me', { headers: { authorization: `Bearer ${token}` } });
    const body = (await withRole.json()) as { data: { permissions: { resource: string; action: string }[] } };
    expect(body.data.permissions).toEqual([{ resource: 'invoices', action: 'list' }]);
  });

  describe('cookie-based session (admin SPA transport)', () => {
    function cookieFromSetHeader(res: Response): string {
      const raw = res.headers.get('set-cookie');
      expect(raw).toBeTruthy();
      return raw!.split(';')[0]!;
    }

    it('login sets an HttpOnly session cookie usable in place of the Authorization header', async () => {
      await registerUser('cookie@example.com', 'pw');
      const res = await authApp.request('/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'cookie@example.com', password: 'pw' }),
      });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie')!;
      expect(setCookie).toMatch(/^ratchet_session=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      // plain http:// in tests — Secure must not be set, or the browser would drop the cookie entirely.
      expect(setCookie).not.toMatch(/Secure/i);

      const cookie = cookieFromSetHeader(res);
      const me = await authApp.request('/me', { headers: { cookie } });
      expect(me.status).toBe(200);
    });

    it('a Bearer header takes precedence over a cookie when both are present', async () => {
      const a = await registerUser('a@example.com', 'pw');
      const b = await registerUser('b@example.com', 'pw');
      const bCookieRes = await authApp.request('/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'b@example.com', password: 'pw' }),
      });
      const bCookie = cookieFromSetHeader(bCookieRes);

      const res = await authApp.request('/me', {
        headers: { authorization: `Bearer ${a.token}`, cookie: bCookie },
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { data: { email: string } }).data.email).toBe('a@example.com');
    });

    it('logout works from the cookie alone and clears it', async () => {
      await registerUser('logout-cookie@example.com', 'pw');
      const res = await authApp.request('/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'logout-cookie@example.com', password: 'pw' }),
      });
      const cookie = cookieFromSetHeader(res);

      const logout = await authApp.request('/logout', { method: 'POST', headers: { cookie } });
      expect(logout.status).toBe(200);
      const clearHeader = logout.headers.get('set-cookie')!;
      expect(clearHeader).toMatch(/^ratchet_session=;|Max-Age=0/i);

      const after = await authApp.request('/me', { headers: { cookie } });
      expect(after.status).toBe(401);
    });
  });

  it('requirePermission wired into Role.operations: no token -> 401, wrong permission -> 403, granted permission -> 201', async () => {
    const { token, user } = await registerUser('admin@example.com', 'pw');

    const noAuth = await apiApp.request('/roles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'editor' }),
    });
    expect(noAuth.status).toBe(401);

    const forbidden = await apiApp.request('/roles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'editor' }),
    });
    expect(forbidden.status).toBe(403);
    expect(((await forbidden.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // grant this user's role the 'roles:create' permission directly (bypassing the API — this is
    // the out-of-band admin bootstrap the plan calls out as a known gap).
    const adminRoleId = generateId();
    const now = new Date().toISOString();
    await db.execute(
      sql`INSERT INTO roles (id, created_at, updated_at, name) VALUES (${adminRoleId}, ${now}, ${now}, 'admin')`,
    );
    await db.execute(
      sql`INSERT INTO permissions (id, created_at, updated_at, role_id, resource, action)
          VALUES (${generateId()}, ${now}, ${now}, ${adminRoleId}, 'roles', 'create')`,
    );
    await db.execute(sql`UPDATE users SET role_id = ${adminRoleId} WHERE id = ${user.id}`);

    const allowed = await apiApp.request('/roles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'editor' }),
    });
    expect(allowed.status).toBe(201);
    expect(((await allowed.json()) as { data: { name: string } }).data.name).toBe('editor');
  });

  describe('admin metadata API (src/admin/router.ts)', () => {
    it('GET /api/models requires auth', async () => {
      const res = await adminApp.request('/api/models');
      expect(res.status).toBe(401);
    });

    it('lists non-hidden models with admin label/displayField, excludes the hidden Session model', async () => {
      const { token } = await registerUser('models@example.com', 'pw');
      const res = await adminApp.request('/api/models', { headers: { authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { name: string; label: string; displayField: string }[] };

      const names = body.data.map((m) => m.name);
      expect(names).toContain('widgets');
      expect(names).toContain('users');
      expect(names).not.toContain('sessions');

      const widgets = body.data.find((m) => m.name === 'widgets')!;
      expect(widgets.label).toBe('Widgets');
      expect(widgets.displayField).toBe('name');

      const users = body.data.find((m) => m.name === 'users')!;
      expect(users.displayField).toBe('id'); // no admin.displayField declared -> defaults to 'id'
    });

    it("strips operations/zod-schema and exposes passwordHash's writeAs", async () => {
      const { token } = await registerUser('meta@example.com', 'pw');
      const res = await adminApp.request('/api/models/users', { headers: { authorization: `Bearer ${token}` } });
      const body = (await res.json()) as { data: { fields: { key: string; sensitive: boolean; writeAs?: string }[] } };

      const passwordHash = body.data.fields.find((f) => f.key === 'passwordHash')!;
      expect(passwordHash.sensitive).toBe(true);
      expect(passwordHash.writeAs).toBe('password');
      expect(JSON.stringify(body.data)).not.toMatch(/operations/);
    });

    it('GET /api/models/:name 404s for a hidden model, matching an unknown model', async () => {
      const { token } = await registerUser('hidden@example.com', 'pw');
      const hidden = await adminApp.request('/api/models/sessions', { headers: { authorization: `Bearer ${token}` } });
      expect(hidden.status).toBe(404);
      const unknown = await adminApp.request('/api/models/nope', { headers: { authorization: `Bearer ${token}` } });
      expect(unknown.status).toBe(404);
    });
  });
});
