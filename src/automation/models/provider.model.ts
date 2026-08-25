import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission } from '../../auth/pipeline.js';

/**
 * A saved API credential + endpoint. `Agent.providerId` references one of these so an agent
 * picks a `Provider` instead of typing an API key (or an env var name) directly. `apiKey` is
 * `sensitive: true` (see `core/serialize.ts`) — stored in plain, read server-side by
 * `runAgentTurn` (src/automation/run-turn.ts), but stripped from every HTTP response the same
 * way `User.passwordHash` is.
 */
export const Provider = defineModel('providers', {
  fields: {
    name: field.string({ required: true, unique: true, indexed: true, maxLength: 255 }),
    // base URL override — meaningful to the openai-compatible adapter (Azure OpenAI, Groq,
    // Together, OpenRouter, local vLLM/Ollama, ...); left blank to use a provider's default endpoint.
    url: field.string({ required: false, maxLength: 2048 }),
    apiKey: field.string({ required: true, sensitive: true, maxLength: 512, displayText: 'API Key', writeAs: "apiKey" }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('providers', 'create'), validate, persist),
    update: pipe(requireAuth, requirePermission('providers', 'update'), validate, persist),
    remove: pipe(requireAuth, requirePermission('providers', 'remove'), persist.remove),
  },
  console: { label: 'Providers', displayField: 'name' },
});
