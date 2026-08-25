import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { OperationContext } from '../src/core/index.js';
import { generateId } from '../src/core/id.js';
import { insertRow } from '../src/core/persistence.js';
import { JobTitle } from '../src/auth/models/job-title.model.js';
import { Workspace, WorkspaceView } from '../src/workspace/models/index.js';
import { assertOwnsWorkspace, requireWorkspaceOwnership } from '../src/workspace/pipeline.js';
import { createDefaultWorkspace, DEFAULT_WORKSPACE_NAME } from '../src/workspace/provisioning.js';

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

  // No beforeEach TRUNCATE / afterAll DROP here: `workspaces`/`workspace_views` are also written
  // by `auth.test.ts` (register/setup now provision a default `Workspace`, `workspace/
  // provisioning.ts`) and this file's own `createDefaultWorkspace` suite below — vitest runs test
  // *files* in parallel against the same live DB, so truncating/dropping a table another file is
  // mid-use of races it (see auth.test.ts's own note on `users`/`sessions` for the same issue).
  // Every test below is scoped to its own freshly generated ids, so an unclean table is harmless.
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

  afterAll(async () => {
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

describeIfDb('createDefaultWorkspace (src/workspace/provisioning.ts, against a live Postgres)', () => {
  let client: postgres.Sql;
  let db: PgDatabase<any, any, any>;

  beforeAll(async () => {
    client = postgres(connectionString!);
    db = drizzle(client) as unknown as PgDatabase<any, any, any>;
    // `workspaces`/`workspace_views` are shared with `auth.test.ts` and the
    // `requireWorkspaceOwnership` suite above (see that suite's note) — not truncated/dropped
    // here either. `job_titles` is exclusive to this file, so it's safe to reset between tests.
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
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_titles (
        id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
        name varchar NOT NULL, rank integer NOT NULL, workspace_template_id uuid NOT NULL
      )`);
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE job_titles`);
  });

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS job_titles`);
    await client.end();
  });

  function ctxForNewUser(userId: string, jobTitleId?: string): OperationContext {
    return {
      operation: 'create',
      input: {},
      doc: jobTitleId ? { id: userId, jobTitleId } : { id: userId },
      model: Workspace,
      db,
    };
  }

  it('provisions a blank "My Workspace" for a user with no jobTitleId', async () => {
    const userId = generateId();
    await createDefaultWorkspace(ctxForNewUser(userId));

    const workspaces = await db.execute(sql`SELECT name, user_id FROM workspaces WHERE user_id = ${userId}`);
    expect(workspaces).toEqual([{ name: DEFAULT_WORKSPACE_NAME, user_id: userId }]);
  });

  it("clones the job title's template workspace tabs into a new workspace owned by the user", async () => {
    const templateOwnerId = generateId();
    const template = await insertRow(db, Workspace, { userId: templateOwnerId, name: 'Sales Template' });
    await insertRow(db, WorkspaceView, {
      userId: templateOwnerId,
      workspaceId: template.id,
      targetModel: 'leads',
      label: 'My Leads',
      filters: [['status', '=', 'open']],
      sortField: 'createdAt',
      sortDirection: 'desc',
      order: 0,
    });
    await insertRow(db, WorkspaceView, {
      userId: templateOwnerId,
      workspaceId: template.id,
      targetModel: 'deals',
      label: 'Pipeline',
      order: 1,
    });
    const jobTitle = await insertRow(db, JobTitle, { name: 'Sales Rep', rank: 2, workspaceTemplateId: template.id });

    const newUserId = generateId();
    await createDefaultWorkspace(ctxForNewUser(newUserId, jobTitle.id as string));

    const workspaces = (await db.execute(
      sql`SELECT id, name FROM workspaces WHERE user_id = ${newUserId}`,
    )) as unknown as { id: string; name: string }[];
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]!.name).toBe('Sales Rep');

    const views = (await db.execute(
      sql`SELECT target_model, label, user_id, workspace_id FROM workspace_views WHERE workspace_id = ${workspaces[0]!.id} ORDER BY "order"`,
    )) as unknown as { target_model: string; label: string; user_id: string; workspace_id: string }[];
    expect(views).toEqual([
      { target_model: 'leads', label: 'My Leads', user_id: newUserId, workspace_id: workspaces[0]!.id },
      { target_model: 'deals', label: 'Pipeline', user_id: newUserId, workspace_id: workspaces[0]!.id },
    ]);

    // the template itself is untouched — still one workspace, still owned by its original creator.
    const templateViews = await db.execute(sql`SELECT id FROM workspace_views WHERE workspace_id = ${template.id}`);
    expect(templateViews).toHaveLength(2);
  });

  it('is a no-op when ctx.doc has no id (nothing to provision for)', async () => {
    // `workspaces` is shared with other suites running concurrently (see the beforeAll note
    // above), so this checks the row count doesn't change rather than asserting the table is
    // empty.
    const before = (await db.execute(sql`SELECT count(*)::int AS count FROM workspaces`)) as unknown as {
      count: number;
    }[];
    const ctx: OperationContext = { operation: 'create', input: {}, doc: null, model: Workspace, db };
    await createDefaultWorkspace(ctx);
    const after = (await db.execute(sql`SELECT count(*)::int AS count FROM workspaces`)) as unknown as {
      count: number;
    }[];
    expect(after[0]!.count).toBe(before[0]!.count);
  });
});
