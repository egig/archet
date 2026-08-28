import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { rowToCamelCase } from '../core/naming.js';

type AnyDb = PgDatabase<any, any, any>;

/**
 * Raw `sql` queries against the built-in auth tables, deliberately independent of
 * `ModelDefinition`/`persistence.ts` — `src/auth/models/*.model.ts` reference these pipeline
 * fns (`requireAuth`/`requirePermission`) inside their own `operations` config, so resolving a
 * lookup through the model objects themselves would be circular. Table/column names are the
 * framework's own fixed built-in schema, not derived from user models.
 */

async function execRows(db: AnyDb, query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  const result = await db.execute(query);
  return result as unknown as Record<string, unknown>[];
}

export interface SessionRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

export async function findSessionByToken(db: AnyDb, token: string): Promise<SessionRow | null> {
  const rows = await execRows(
    db,
    sql`SELECT id, user_id, token, expires_at FROM sessions WHERE token = ${token} AND deleted_at IS NULL LIMIT 1`,
  );
  return rows[0] ? (rowToCamelCase(rows[0]) as unknown as SessionRow) : null;
}

export async function insertSession(db: AnyDb, id: string, userId: string, token: string, expiresAt: Date, now: Date): Promise<SessionRow> {
  const rows = await execRows(
    db,
    sql`INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at, created_by_id)
        VALUES (${id}, ${userId}, ${token}, ${expiresAt.toISOString()}, ${now.toISOString()}, ${now.toISOString()}, ${userId})
        RETURNING id, user_id, token, expires_at`,
  );
  const row = rows[0];
  if (!row) throw new Error('insertSession: insert returned no row');
  return rowToCamelCase(row) as unknown as SessionRow;
}

export async function deleteSessionByToken(db: AnyDb, token: string): Promise<void> {
  await db.execute(sql`DELETE FROM sessions WHERE token = ${token}`);
}

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  roleId: string | null;
  active: boolean;
}

export async function findUserById(db: AnyDb, id: string): Promise<UserRow | null> {
  const rows = await execRows(
    db,
    sql`SELECT id, email, password_hash, role_id, active FROM users WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`,
  );
  return rows[0] ? (rowToCamelCase(rows[0]) as unknown as UserRow) : null;
}

export async function findUserByEmail(db: AnyDb, email: string): Promise<UserRow | null> {
  const rows = await execRows(
    db,
    sql`SELECT id, email, password_hash, role_id, active FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`,
  );
  return rows[0] ? (rowToCamelCase(rows[0]) as unknown as UserRow) : null;
}

export interface PermissionRow {
  resource: string;
  action: string;
  /** null for a row scoped to a fieldless action (`remove`) — see `validatePermissionTarget`,
   * which enforces that a `read`/`create`/`update`/`*` entry always has one and a `remove` entry
   * never does. */
  field: string | null;
}

/** Reads one role's entire grant list off its `permissions` jsonb column (`Role.permissions`,
 * src/auth/models/role.model.ts) — no junction table anymore. A grant entry that omits `field`
 * entirely (rather than carrying an explicit `null`) is normalized to `field: null` here so every
 * caller (`resolveGrantedFields`, tests) can rely on `field: string | null`, never `undefined`. */
export async function listPermissionsForRole(db: AnyDb, roleId: string): Promise<PermissionRow[]> {
  const rows = await execRows(
    db,
    sql`SELECT permissions FROM roles WHERE id = ${roleId} AND deleted_at IS NULL LIMIT 1`,
  );
  const raw = (rows[0]?.permissions as Array<{ resource: string; action: string; field?: string | null }> | null) ?? [];
  return raw.map((p) => ({ resource: p.resource, action: p.action, field: p.field ?? null }));
}

export interface RoleRow {
  id: string;
  name: string;
}

export async function findRoleByName(db: AnyDb, name: string): Promise<RoleRow | null> {
  const rows = await execRows(db, sql`SELECT id, name FROM roles WHERE name = ${name} AND deleted_at IS NULL LIMIT 1`);
  return rows[0] ? (rowToCamelCase(rows[0]) as unknown as RoleRow) : null;
}

/**
 * True once *any* user — active or not — holds a `*:*` permission through their role. Used to
 * decide whether `/api/auth/setup` (root-admin onboarding) is still open. Deliberately ignores
 * `active`: gating on it would let deactivating the sole root admin reopen unauthenticated root
 * creation to anyone who hits the console UI. `@>` is a jsonb "contains" check — true as soon as
 * *any* element of `roles.permissions` matches `{"resource":"*","action":"*"}`, regardless of
 * that element's own `field` value or how many other grants sit alongside it.
 */
export async function hasRootAdmin(db: AnyDb): Promise<boolean> {
  const rows = await execRows(
    db,
    sql`SELECT 1
        FROM users u
        JOIN roles r ON r.id = u.role_id AND r.deleted_at IS NULL
        WHERE u.deleted_at IS NULL AND r.permissions @> '[{"resource":"*","action":"*"}]'::jsonb
        LIMIT 1`,
  );
  return rows.length > 0;
}
