import { defineModel, field } from '../../core/index.js';

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
  console: { label: 'Providers', displayField: 'name' },
});
