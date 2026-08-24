import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ZodTypeAny, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolSpec } from './provider.js';
import type { UserRow } from '../auth/lookup.js';

type AnyDb = PgDatabase<any, any, any>;

export interface AgentToolContext {
  db: AnyDb;
  user: UserRow;
}

export interface AgentTool<S extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  execute: (input: z.infer<S>, ctx: AgentToolContext) => Promise<unknown>;
}

/**
 * Same "declared in code, referenced by name in data" split as `Permission.resource`/`.action`
 * (src/auth/models/permission.model.ts): `Agent.allowedTools` (src/automation/models/agent.model.ts)
 * stores tool *names*, resolved against this in-process registry at request time — a tool's
 * `execute` function is never serialized into the database.
 */
const registry = new Map<string, AgentTool>();

export function defineAgentTool<S extends ZodTypeAny>(tool: AgentTool<S>): AgentTool<S> {
  if (registry.has(tool.name)) {
    throw new Error(`defineAgentTool: a tool named '${tool.name}' is already registered`);
  }
  registry.set(tool.name, tool as unknown as AgentTool);
  return tool;
}

export function getAgentTool(name: string): AgentTool | undefined {
  return registry.get(name);
}

/** Resolves `Agent.allowedTools` (string[] of names) to their `ToolSpec`s for a `ChatRequest`,
 * skipping any name that isn't (or is no longer) registered rather than failing the whole turn. */
export function resolveToolSpecs(allowedTools: unknown): ToolSpec[] {
  if (!Array.isArray(allowedTools)) return [];
  const specs: ToolSpec[] = [];
  for (const name of allowedTools) {
    if (typeof name !== 'string') continue;
    const tool = registry.get(name);
    if (!tool) continue;
    specs.push({ name: tool.name, description: tool.description, parameters: zodToJsonSchema(tool.schema) as Record<string, unknown> });
  }
  return specs;
}
