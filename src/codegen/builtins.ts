import { User, Role, Permission, Session } from '../auth/models/index.js';
import type { ScannedModel } from './scan.js';

/**
 * The framework's own User/Role/Permission/Session models (src/auth/models/*.model.ts) — always
 * part of the model graph `generate()` builds from, without a consuming app declaring them under
 * `models/`. Unlike a scanned user model, there's no on-disk `filePath` to import from at
 * codegen time; `registry-gen.ts`/`validators-gen.ts` special-case `builtin: true` to import
 * these from the `@egig/ratchet/auth` package specifier instead.
 */
export const BUILTIN_MODELS: ScannedModel[] = [
  { filePath: '@egig/ratchet/auth (User)', exportName: 'User', model: User, builtin: true },
  { filePath: '@egig/ratchet/auth (Role)', exportName: 'Role', model: Role, builtin: true },
  { filePath: '@egig/ratchet/auth (Permission)', exportName: 'Permission', model: Permission, builtin: true },
  { filePath: '@egig/ratchet/auth (Session)', exportName: 'Session', model: Session, builtin: true },
];
