import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { generateId } from '../src/core/id.js';
import type { OperationContext } from '../src/core/pipeline.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { hashPassword as hashPasswordPipeline } from '../src/auth/pipeline.js';
import { User, Role, Permission } from '../src/auth/models/index.js';
import { createAuthRouter } from '../src/auth/router.js';
import { createApiRouter } from '../src/router/create-router.js';

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
});
