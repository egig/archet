import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition, OperationContext } from '../core/index.js';
import { buildCreateSchema, buildUpdateSchema } from '../core/index.js';
import { authorizeRequest, resolveGrantedFields, assertWriteFieldsAllowed } from '../auth/pipeline.js';
import { listPermissionsForAgent } from './lookup.js';
import type { ToolSpec } from './provider.js';

type AnyDb = PgDatabase<any, any, any>;

// Mirrors `core`'s `Operation` exactly (create/update/remove) — kept as its own type here mainly
// so `OPERATIONS` below has a single source of truth for iterating the tool-generating verbs.
type ToolOperation = 'create' | 'update' | 'remove';

const OPERATIONS: ToolOperation[] = ['create', 'update', 'remove'];

export interface ModelOperationTool {
  spec: ToolSpec;
  model: ModelDefinition;
  operation: ToolOperation;
}

function toolName(operation: ToolOperation, resource: string): string {
  return `${operation}_${resource}`;
}

/** create's input is exactly the model's fields; update adds an `id` (there's no route param to
 * carry it here, unlike `/api/:model/:id`) to an otherwise-partial version of the same fields;
 * remove needs nothing but `id`. */
function toolInputSchema(model: ModelDefinition, operation: ToolOperation): z.ZodTypeAny {
  if (operation === 'create') return buildCreateSchema(model);
  if (operation === 'update') return (buildUpdateSchema(model) as z.ZodObject<z.ZodRawShape>).extend({ id: z.string().uuid() });
  return z.object({ id: z.string().uuid() });
}

/** Expands one `AgentPermission` grant's `(resource, action)` — either of which may be `'*'`,
 * same wildcard semantics `requirePermission` checks at call time (src/auth/pipeline.ts) — into
 * concrete (model, operation) pairs against the live registry. */
function expandGrant(
  registry: Record<string, ModelDefinition>,
  resource: string,
  action: string,
): Array<{ model: ModelDefinition; operation: ToolOperation }> {
  const models = resource === '*' ? Object.values(registry) : registry[resource] ? [registry[resource]] : [];
  const operations = action === '*' ? OPERATIONS : OPERATIONS.filter((op) => op === action);
  return models.flatMap((model) => operations.map((operation) => ({ model, operation })));
}

/**
 * Resolves an `Agent`'s `AgentPermission` grants (src/automation/models/agent-permission.model.ts)
 * into callable tools — one per (model, operation) pair the grants expand to, deduplicated by
 * tool name (`create_<resource>`, `update_<resource>`, `remove_<resource>`). A tool's input
 * schema is exactly the target model's own create/update Zod schema, so a granted tool accepts
 * precisely what the equivalent `/api/:model` REST call would.
 */
export async function resolveAgentTools(
  db: AnyDb,
  registry: Record<string, ModelDefinition>,
  agentId: string,
): Promise<ModelOperationTool[]> {
  const grants = await listPermissionsForAgent(db, agentId);
  const byName = new Map<string, ModelOperationTool>();

  for (const grant of grants) {
    for (const { model, operation } of expandGrant(registry, grant.resource, grant.action)) {
      const name = toolName(operation, model.name);
      if (byName.has(name)) continue;
      byName.set(name, {
        model,
        operation,
        spec: {
          name,
          description: `${operation} a '${model.name}' row.`,
          parameters: zodToJsonSchema(toolInputSchema(model, operation)) as Record<string, unknown>,
        },
      });
    }
  }

  return [...byName.values()];
}

/**
 * Runs a granted tool call through the target model's own `operations[operation]` pipeline — the
 * exact same call `/api/:model` would make (src/router/create-router.ts). Model pipelines
 * themselves no longer carry their own `requireAuth`/`requirePermission` steps (the generic
 * router applies both implicitly to every model — see `create-router.ts`'s `resolveAccess`/
 * `resolveFieldAccess`), so this — the *other* caller of `model.operations[...]` that bypasses
 * that router entirely — has to perform the identical check itself, against the chat's own
 * `request` (never `AgentPermission` alone): `authorizeRequest` for the resource:action grant,
 * `resolveGrantedFields` + `assertWriteFieldsAllowed` for create/update's field-level grant
 * (`remove` has no field concept — see `FIELDLESS_ACTIONS`). `AgentPermission` only decided which
 * tools the agent was offered; this is what stops it from doing more than the chat's own user
 * could already do via the REST API.
 */
export async function executeModelOperationTool(
  tool: ModelOperationTool,
  input: Record<string, unknown>,
  ctx: { db: AnyDb; request: Request | undefined; registry: Record<string, ModelDefinition> },
): Promise<unknown> {
  const user = await authorizeRequest(ctx.db, ctx.request, tool.model.name, tool.operation);

  const { id, ...rest } = input as { id?: string } & Record<string, unknown>;
  const writeInput = tool.operation === 'create' ? input : rest;

  if (tool.operation === 'create' || tool.operation === 'update') {
    const granted = await resolveGrantedFields(ctx.db, user.roleId, tool.model.name, tool.operation);
    assertWriteFieldsAllowed(tool.model, writeInput, granted);
  }

  const opCtx: OperationContext = {
    operation: tool.operation,
    id: tool.operation === 'create' ? undefined : id,
    input: writeInput,
    doc: null,
    model: tool.model,
    db: ctx.db,
    request: ctx.request,
    registry: ctx.registry,
    user: user as unknown as Record<string, unknown>,
  };
  const result = await tool.model.operations[tool.operation](opCtx);
  return result.doc;
}
