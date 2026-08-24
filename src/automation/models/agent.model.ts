import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireAuth, requirePermission } from '../../auth/pipeline.js';

/**
 * A reusable assistant config — system prompt + provider/model + tools — not a live
 * conversation. `Chat` rows reference an `Agent`; every turn in that chat is served by
 * whichever `ChatProvider` `provider` resolves to (src/automation/providers/index.ts).
 */
export const Agent = defineModel('agents', {
  fields: {
    name: field.string({ required: true, unique: true, indexed: true, maxLength: 255 }),
    description: field.text({ required: false }),
    systemPrompt: field.text({ required: true }),
    provider: field.enum(['anthropic', 'openai'], { default: 'anthropic' }),
    model: field.string({ default: 'claude-opus-5', maxLength: 255 }),
    // only meaningful for provider: 'openai' — overrides the SDK's default endpoint so any
    // OpenAI-compatible host (Azure OpenAI, Groq, Together, OpenRouter, local vLLM/Ollama, ...) works.
    baseUrl: field.string({ required: false, maxLength: 2048 }),
    // name of the env var holding the provider's API key — never the key itself, same
    // "reference by name, resolve at request time" pattern as Permission.resource/action.
    apiKeyEnvVar: field.string({ default: 'ANTHROPIC_API_KEY', maxLength: 255 }),
    // string[] of tool names resolved against the code-side registry (src/automation/tool.ts) —
    // stored as data the same way Permission.resource names a model by string, not by reference.
    allowedTools: field.json({ required: false }),
    // provider-specific passthrough (e.g. { effort: 'high' }) — ignored by adapters that don't
    // support a given key.
    config: field.json({ required: false }),
    active: field.boolean({ default: true }),
  },
  operations: {
    create: pipe(requireAuth, requirePermission('agents', 'create'), validate, persist),
    update: pipe(requireAuth, requirePermission('agents', 'update'), validate, persist),
    remove: pipe(requireAuth, requirePermission('agents', 'remove'), persist.remove),
  },
  console: { displayField: 'name' },
});
