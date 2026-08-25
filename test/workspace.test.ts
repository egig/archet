import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { OperationContext } from '../src/core/index.js';
import { generateId } from '../src/core/id.js';
import { insertRow } from '../src/core/persistence.js';
import { Workspace, WorkspaceView } from '../src/workspace/models/index.js';
import { assertOwnsWorkspace, requireWorkspaceOwnership } from '../src/workspace/pipeline.js';

const connectionString = process.env.DATABASE_URL;
const describeIfDb = connectionString ? describe : describe.skip;

describe('assertOwnsWorkspace (src/workspace/pipeline.ts)', () => {
  it('passes for a workspace owned by the given user', () => {
    expect(() => assertOwnsWorkspace({ userId: 'u1' }, { id: 'u1' } as never)).not.toThrow();
  });

  it('404s for a workspace owned by someone else', () => {
    expect(() => assertOwnsWorkspace({ userId: 'u1' }, { id: 'u2' } as never)).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', status: 404 }),
    );
  });

  it('404s (not a leakier error) when the workspace is null — "not found", not "not yours"', () => {
    expect(() => assertOwnsWorkspace(null, { id: 'u1' } as never)).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', status: 404 }),
    );
  });
});

describeIfDb('requireWorkspaceOwnership (against a live Postgres)', () => {
  let client: postgres.Sql;
  let db: PgDatabase<any, any, any>;

  beforeAll(async () => {
    client = postgres(connectionString!);
    db = drizzle(client) as unknown as PgDatabase<any, any, any>;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workspaces (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
        user_id uuid NOT NULL, name varchar NOT NULL
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workspace_views (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
        user_id uuid NOT NULL, workspace_id uuid NOT NULL, target_model varchar NOT NULL, label varchar NOT NULL,
        filters jsonb, sort_field varchar, sort_direction varchar NOT NULL DEFAULT 'asc', include jsonb,
        "limit" integer NOT NULL DEFAULT 20, "order" integer NOT NULL DEFAULT 0
      )`);
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE workspace_views, workspaces`);
  });

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS workspace_views`);
    await db.execute(sql`DROP TABLE IF EXISTS workspaces`);
    await client.end();
  });

  function ctxFor(userId: string, workspaceId: string | undefined): OperationContext {
    return {
      operation: 'create',
      input: workspaceId ? { workspaceId } : {},
      doc: null,
      model: WorkspaceView,
      db,
      user: { id: userId },
    };
  }

  it('passes when the workspaceId belongs to the requesting user', async () => {
    const userA = generateId();
    const workspace = await insertRow(db, Workspace, { userId: userA, name: 'Mine' });

    await expect(requireWorkspaceOwnership(ctxFor(userA, workspace.id as string))).resolves.toBeDefined();
  });

  it("404s when the workspaceId belongs to a different user (stops a view attaching to someone else's workspace)", async () => {
    const userA = generateId();
    const userB = generateId();
    const workspace = await insertRow(db, Workspace, { userId: userA, name: 'Mine' });

    await expect(requireWorkspaceOwnership(ctxFor(userB, workspace.id as string))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('404s when the workspaceId does not exist', async () => {
    const userA = generateId();
    await expect(
      requireWorkspaceOwnership(ctxFor(userA, '00000000-0000-7000-8000-000000000000')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('is a no-op when there is no workspaceId to check (e.g. an update not touching it)', async () => {
    const userA = generateId();
    const ctx = ctxFor(userA, undefined);
    await expect(requireWorkspaceOwnership(ctx)).resolves.toBe(ctx);
  });
});
