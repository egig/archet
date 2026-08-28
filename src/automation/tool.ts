import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { CustomOperationDefinition, ModelDefinition, OperationContext, PipelineFn } from '../core/index.js';
import { buildCreateSchema, buildUpdateSchema, buildParamsSchema } from '../core/index.js';
import { authorizeRequest, resolveGrantedFields, assertWriteFieldsAllowed } from '../auth/pipeline.js';
import { listPermissionsForAgent } from './lookup.js';
import type { ToolSpec } from './provider.js';

type AnyDb = PgDatabase<any, any, any>;

// The three builtin write verbs, exactly as `core`'s `Operation` names them — kept as its own
// list here so `expandGrant` has one source of truth for "which verbs every model always has".
const BUILTIN_OPERATIONS = ['create', 'update', 'remove'] as const;
type BuiltinOperation = (typeof BUILTIN_OPERATIONS)[number];

function isBuiltin(op: string): op is BuiltinOperation {
  return (BUILTIN_OPERATIONS as readonly string[]).includes(op);
}

/** Custom operations declared on a model (core/model.ts's `CustomOperationDefinition`) — every
 * `operations` key that isn't one of the three builtins. */
function customOperationNames(model: ModelDefinition): string[] {
  return Object.keys(model.operations).filter((op) => !isBuiltin(op));
}

export interface AgentTool {
  spec: ToolSpec;
  model: ModelDefinition;
  /** a builtin verb (`create`/`update`/`remove`) or the name of a custom operation declared on
   * `model` — `executeAgentTool` branches on `isBuiltin(operation)`. */
  operation: string;
}

function toolName(operation: string, resource: string): string {
  return `${operation}_${resource}`;
}

/**
 * builtin: create's input is exactly the model's fields; update adds an `id` (there's no route
 * param to carry it here, unlike `/api/:model/:id`) to an otherwise-partial version of the same
 * fields; remove needs nothing but `id`.
 *
 * custom: a custom operation is always record-scoped (`POST /:model/:id/:operation`,
 * create-router.ts), so its input is its own declared `params` (validated the same way the route
 * validates them — `buildParamsSchema`) plus a required `id`. A param-less operation collapses to
 * just `{ id }`.
 */
function toolInputSchema(model: ModelDefinition, operation: string): z.ZodTypeAny {
  if (operation === 'create') return buildCreateSchema(model);
  if (operation === 'update') return (buildUpdateSchema(model) as z.ZodObject<z.ZodRawShape>).extend({ id: z.string().uuid() });
  if (operation === 'remove') return z.object({ id: z.string().uuid() });

  const entry = model.operations[operation];
  const params = entry && typeof entry !== 'function' ? entry.params : undefined;
  return (buildParamsSchema(params ?? {}) as z.ZodObject<z.ZodRawShape>).extend({ id: z.string().uuid() });
}

/** The `description` a chatting model reads to decide when to call the tool. `model.description`
 * (when set) is appended to every tool for that model so the resource name isn't the only context;
 * a custom operation additionally prefers its own `description`, then `console.label`. */
function toolDescription(model: ModelDefinition, operation: string): string {
  const suffix = model.description ? ` ${model.description}` : '';
  if (isBuiltin(operation)) {
    const verb = {
      create: `Create a new '${model.name}' row.`,
      update: `Update an existing '${model.name}' row by id.`,
      remove: `Delete a '${model.name}' row by id.`,
    }[operation];
    return verb + suffix;
  }
  const entry = model.operations[operation];
  const def: CustomOperationDefinition | undefined = entry && typeof entry !== 'function' ? entry : undefined;
  const base = def?.description ?? def?.console?.label ?? `Run the '${operation}' operation on a '${model.name}' row by id.`;
  return base + suffix;
}

/** Expands one `AgentPermission` grant's `(resource, action)` — either of which may be `'*'`,
 * same wildcard semantics `requirePermission` checks at call time (src/auth/pipeline.ts) — into
 * concrete `(model, operation)` pairs against the live registry. `action: '*'` covers the three
 * builtins *and* every custom operation each matched model declares; a concrete `action` matches
 * a builtin verb or a custom operation of that exact name. */
function expandGrant(
  registry: Record<string, ModelDefinition>,
  resource: string,
  action: string,
): Array<{ model: ModelDefinition; operation: string }> {
  const models = resource === '*' ? Object.values(registry) : registry[resource] ? [registry[resource]] : [];
  return models.flatMap((model) => {
    const operations =
      action === '*'
        ? [...BUILTIN_OPERATIONS, ...customOperationNames(model)]
        : isBuiltin(action) || model.operations[action]
          ? [action]
          : [];
    return operations.map((operation) => ({ model, operation }));
  });
}

/**
 * Resolves an `Agent`'s `AgentPermission` grants (src/automation/models/agent-permission.model.ts)
 * into callable tools — one per (model, operation) pair the grants expand to, deduplicated by
 * tool name (`<operation>_<resource>`, e.g. `create_invoice`, `lock_invoice`). A builtin tool's
 * input schema is exactly the target model's create/update Zod schema; a custom operation's is its
 * declared `params` plus a record `id`.
 */
export async function resolveAgentTools(
  db: AnyDb,
  registry: Record<string, ModelDefinition>,
  agentId: string,
): Promise<AgentTool[]> {
  const grants = await listPermissionsForAgent(db, agentId);
  const byName = new Map<string, AgentTool>();

  for (const grant of grants) {
    for (const { model, operation } of expandGrant(registry, grant.resource, grant.action)) {
      const name = toolName(operation, model.name);
      if (byName.has(name)) continue;
      byName.set(name, {
        model,
        operation,
        spec: {
          name,
          description: toolDescription(model, operation),
          parameters: zodToJsonSchema(toolInputSchema(model, operation)) as Record<string, unknown>,
        },
      });
    }
  }

  return [...byName.values()];
}

function buildOpContext(
  tool: AgentTool,
  ctx: { db: AnyDb; request: Request | undefined; registry: Record<string, ModelDefinition> },
  fields: { id: string | undefined; input: Record<string, unknown>; user: unknown },
): OperationContext {
  return {
    operation: tool.operation,
    id: tool.operation === 'create' ? undefined : fields.id,
    input: fields.input,
    doc: null,
    model: tool.model,
    db: ctx.db,
    request: ctx.request,
    registry: ctx.registry,
    user: fields.user as Record<string, unknown>,
  };
}

/**
 * Runs a granted tool call through the target model's own pipeline — the exact same call
 * `/api/:model` (builtin) or `/api/:model/:id/:operation` (custom) would make. Model pipelines no
 * longer carry their own `requireAuth`/`requirePermission` steps (the generic router applies both
 * implicitly — see `create-router.ts`), so this — the *other* caller that bypasses that router —
 * performs the identical checks itself, against the chat's own `request` (never `AgentPermission`
 * alone):
 *
 * - builtin: `authorizeRequest` for the `resource:action` grant, then `resolveGrantedFields` +
 *   `assertWriteFieldsAllowed` for create/update's field-level grant (`remove` has no field
 *   concept).
 * - custom: `authorizeRequest` for the `resource:<operation>` grant only — mirrors
 *   `create-router.ts`'s `resolveAccess(model, operationName)`. Whatever the operation's own
 *   pipeline writes is gated by that pipeline (e.g. `presetFields` re-checks the `update` field
 *   grant), not here.
 *
 * `AgentPermission` only decided which tools the agent was offered; this is what stops it from
 * doing more than the chat's own user could already do via the REST API.
 */
export async function executeAgentTool(
  tool: AgentTool,
  input: Record<string, unknown>,
  ctx: { db: AnyDb; request: Request | undefined; registry: Record<string, ModelDefinition> },
): Promise<unknown> {
  return isBuiltin(tool.operation)
    ? executeBuiltinTool(tool, input, ctx)
    : executeCustomTool(tool, input, ctx);
}

async function executeBuiltinTool(
  tool: AgentTool,
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

  const result = await tool.model.operations[tool.operation as BuiltinOperation](
    buildOpContext(tool, ctx, { id, input: writeInput, user }),
  );
  return result.doc;
}

async function executeCustomTool(
  tool: AgentTool,
  input: Record<string, unknown>,
  ctx: { db: AnyDb; request: Request | undefined; registry: Record<string, ModelDefinition> },
): Promise<unknown> {
  const entry = tool.model.operations[tool.operation];
  if (!entry) throw new Error(`operation '${tool.operation}' no longer exists on '${tool.model.name}'`);
  const def: CustomOperationDefinition | undefined = typeof entry === 'function' ? undefined : entry;
  const pipelineFn: PipelineFn = typeof entry === 'function' ? entry : entry.pipeline;

  // Resource-level "can this role invoke this operation at all" gate only — same as
  // create-router.ts's `resolveAccess(model, operationName)`.
  const user = await authorizeRequest(ctx.db, ctx.request, tool.model.name, tool.operation);

  const { id, ...rest } = input as { id?: string } & Record<string, unknown>;
  if (typeof id !== 'string') throw new Error(`'${tool.operation}' needs an 'id' (custom operations are record-scoped)`);

  let params: Record<string, unknown> = {};
  if (def?.params) {
    const parsed = buildParamsSchema(def.params).safeParse(rest);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new Error(`invalid params for '${tool.operation}': ${detail}`);
    }
    params = parsed.data as Record<string, unknown>;
  }

  const result = await pipelineFn(buildOpContext(tool, ctx, { id, input: params, user }));
  return result.doc;
}
