// A separate entry point from `./index.ts` (the package's main `@egig/ratchet/auth` surface,
// which `ratchet serve`/the generated registry import at request time) — deliberately, so a
// plain backend deploy never has to resolve `react` just because it imported `ratchet/auth` for
// `createAuthRouter`/the model definitions. Only the console client bundle (built by
// `Bun.build`, browser-side — see `src/codegen/builtins.ts`'s `BUILTIN_FORMS`, wired in the same
// way a consumer's own `<name>.form.tsx` is) ever imports this file.
export { default as RoleForm } from './models/role.form.js';
