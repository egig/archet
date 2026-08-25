import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { rowToCamelCase } from '../core/naming.js';

type AnyDb = PgDatabase<any, any, any>;

async function execRows(db: AnyDb, query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  const result = await db.execute(query);
  return result as unknown as Record<string, unknown>[];
}

export interface AgentPermissionGrant {
  resource: string;
  action: string;
}

/** Raw `sql`, same reasoning as `listPermissionsForRole` (src/auth/lookup.ts): this is read by
 * `src/automation/tool.ts` while building an agent's tool list, before any `ModelDefinition`
 * machinery is in play, so going through `AgentPermission`'s own model object would be circular. */
export async function listPermissionsForAgent(db: AnyDb, agentId: string): Promise<AgentPermissionGrant[]> {
  const rows = await execRows(
    db,
    sql`SELECT resource, action FROM agent_permissions WHERE agent_id = ${agentId} AND deleted_at IS NULL`,
  );
  return rows.map((r) => rowToCamelCase(r) as unknown as AgentPermissionGrant);
}
