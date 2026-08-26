import { defineModel, field } from '../../core/index.js';

/**
 * A reusable assistant config — system prompt + provider/model + tools — not a live
 * conversation. `Chat` rows reference an `Agent`; every turn in that chat is served by
 * whichever `ChatProvider` `provider` resolves to (src/automation/providers/index.ts), calling
 * out with the API key/base URL from whichever `Provider` row `providerId` points at
 * (src/automation/models/provider.model.ts) rather than an agent typing a key directly. An
 * agent's tools aren't declared here at all — they're whatever `AgentPermission` rows
 * (src/automation/models/agent-permission.model.ts) name this agent, expanded into callable
 * model-operation tools by `src/automation/tool.ts`.
 */
export const Agent = defineModel('agents', {
  fields: {
    name: field.string({ required: true, unique: true, indexed: true, maxLength: 255 }),
    description: field.text({ required: false }),
    systemPrompt: field.text({ required: true }),
    providerId: field.reference('providers', { required: true, indexed: true, displayText: 'Provider' }),
    model: field.string({ default: 'claude-opus-5', maxLength: 255 }),
    // provider-specific passthrough (e.g. { effort: 'high' }) — ignored by adapters that don't
    // support a given key.
    config: field.json({ required: false }),
    active: field.boolean({ default: true }),
  },
  console: { label: 'Agents', displayField: 'name' },
});
