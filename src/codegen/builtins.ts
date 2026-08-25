import { User, Role, Permission, Session } from '../auth/models/index.js';
import { Agent, Chat, Message } from '../automation/models/index.js';
import { AutomationDomain } from '../automation/domain.js';
import type { ScannedModel } from './scan.js';
import type { ScannedDomain } from './scan-domains.js';

/**
 * The framework's own built-in models — always part of the model graph `generate()` builds
 * from, without a consuming app declaring them under `models/`. Unlike a scanned user model,
 * there's no on-disk `filePath` to import from at codegen time; `registry-gen.ts`/
 * `validators-gen.ts` special-case a set `builtinPackage` to import from that package specifier
 * instead of a relative path. `domain` is set explicitly for the same reason (ADR 0001) — there's
 * no on-disk folder for `folderDomainOf` to infer it from.
 */
export const BUILTIN_MODELS: ScannedModel[] = [
  { filePath: '@egig/ratchet/auth (User)', exportName: 'User', model: User, builtinPackage: '@egig/ratchet/auth', domain: 'auth' },
  { filePath: '@egig/ratchet/auth (Role)', exportName: 'Role', model: Role, builtinPackage: '@egig/ratchet/auth', domain: 'auth' },
  { filePath: '@egig/ratchet/auth (Permission)', exportName: 'Permission', model: Permission, builtinPackage: '@egig/ratchet/auth', domain: 'auth' },
  { filePath: '@egig/ratchet/auth (Session)', exportName: 'Session', model: Session, builtinPackage: '@egig/ratchet/auth', domain: 'auth' },
  { filePath: '@egig/ratchet/automation (Agent)', exportName: 'Agent', model: Agent, builtinPackage: '@egig/ratchet/automation', domain: 'automation' },
  { filePath: '@egig/ratchet/automation (Chat)', exportName: 'Chat', model: Chat, builtinPackage: '@egig/ratchet/automation', domain: 'automation' },
  { filePath: '@egig/ratchet/automation (Message)', exportName: 'Message', model: Message, builtinPackage: '@egig/ratchet/automation', domain: 'automation' },
];

/**
 * The framework's own built-in Domains — same reasoning as `BUILTIN_MODELS` above: the Automation
 * Domain's `consoleMenu` (its Chat link) has no on-disk `*.domain.ts` file to be scanned from.
 */
export const BUILTIN_DOMAINS: ScannedDomain[] = [
  {
    filePath: '@egig/ratchet/automation (AutomationDomain)',
    exportName: 'AutomationDomain',
    domain: AutomationDomain,
    builtinPackage: '@egig/ratchet/automation',
  },
];
