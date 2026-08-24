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
    sql`INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at)
        VALUES (${id}, ${userId}, ${token}, ${expiresAt.toISOString()}, ${now.toISOString()}, ${now.toISOString()})
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
}

export async function listPermissionsForRole(db: AnyDb, roleId: string): Promise<PermissionRow[]> {
  const rows = await execRows(
    db,
    sql`SELECT resource, action FROM permissions WHERE role_id = ${roleId} AND deleted_at IS NULL`,
  );
  return rows.map((r) => rowToCamelCase(r) as unknown as PermissionRow);
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
 * creation to anyone who hits the console UI.
 */
export async function hasRootAdmin(db: AnyDb): Promise<boolean> {
  const rows = await execRows(
    db,
    sql`SELECT 1
        FROM users u
        JOIN permissions p ON p.role_id = u.role_id AND p.deleted_at IS NULL
        WHERE u.deleted_at IS NULL AND p.resource = '*' AND p.action = '*'
        LIMIT 1`,
  );
  return rows.length > 0;
}
