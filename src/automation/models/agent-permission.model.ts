import { defineModel, field, pipe, validate, persist } from '../../core/index.js';
import { requireValidPermissionTarget } from '../../auth/pipeline.js';

/**
 * Grants an `Agent` the ability to call one model operation as a tool — the same
 * `(resource, action)` shape as `Permission` (src/auth/models/permission.model.ts), but scoped to
 * an `Agent` instead of a `Role`. `src/automation/tool.ts` expands every grant for a given agent
 * into a callable `create_<resource>`/`update_<resource>`/`remove_<resource>` tool (wildcards
 * included) against the live model registry.
 *
 * This only decides which tools an agent is *offered* — the actual call still runs through the
 * target model's own `operations[action]` pipeline with the chat's authenticated user, so a grant
 * here can never let an agent do more than that user's own `Role` already permits (see
 * `run-turn.ts`). It narrows, it never escalates.
 */
export const AgentPermission = defineModel('agent_permissions', {
  fields: {
    agentId: field.reference('agents', { required: true, indexed: true, displayText: 'Agent' }),
    // `modelRef`/`actionRef`, not `field.reference`/`field.enum` — same reasoning as
    // `Permission.resource`/`.action`: neither the set of valid resources nor actions is fixed,
    // both are read from the live registry at request time (`requireValidPermissionTarget`).
    resource: field.modelRef({ required: true, indexed: true, allowWildcard: true }),
    action: field.actionRef({ required: true, allowWildcard: true }),
  },
  operations: {
    create: pipe(validate, requireValidPermissionTarget, persist),
    update: pipe(validate, requireValidPermissionTarget, persist),
  },
  // without this, the console's default label is `humanize(model.name)` — a bare capitalize, no
  // underscore-to-space split (see `console/serialize-model.ts`) — so 'agent_permissions' would
  // show up as "Agent_permissions" everywhere from the sidebar to the resource dropdown on
  // `Permission`/`AgentPermission` forms.
  console: { label: 'Agent Permissions' },
});
