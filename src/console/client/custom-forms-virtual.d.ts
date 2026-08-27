// Declares a brand-new ambient module (not an augmentation of a real one) — that only works from
// a file with no top-level import/export of its own (a "global" .d.ts), which is the entire
// reason this lives in its own file instead of alongside the (very similar) __CONSOLE_PATH__ /
// __CONSOLE_BRAND__ declarations in env.d.ts: that file's top-level `import type` (needed for
// `ConsoleBrandConfig`) makes it a module, and a `declare module '...'` block placed there would
// only be visible within env.d.ts itself, not from `main.tsx`.

/** Not a real package — a `Bun.build` plugin (`customFormsPlugin`, src/cli/build-console.ts)
 * resolves this specifier to the consuming project's generated `<generatedDir>/console-forms.ts`
 * (see forms-gen.ts) at bundle time. Declared here purely so `main.tsx`'s `import` of it
 * typechecks against *some* shape — the generated file's real shape is checked independently
 * (it's plain TypeScript, not this ambient stand-in). */
declare module 'ratchet:custom-forms' {
  import type { ModelFormComponent } from './custom-forms.js';
  export const customForms: Record<string, ModelFormComponent>;
}
