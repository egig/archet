import type { ConsoleBrandConfig } from '../../core/config.js';

// `declare global` is required here, not a bare top-level `declare const` — importing the type
// above makes this a module, and a module-scoped `declare const` wouldn't be visible from every
// other file the way an ambient global script's declarations are.
declare global {
  /** Injected by esbuild's `define` at build time (see src/cli/build-console.ts) from
   * `FrameworkConfig.consolePath` — the path this console client is mounted at, e.g. '/console'. */
  const __CONSOLE_PATH__: string;

  /** Injected the same way, from `FrameworkConfig.brand` — `{}` when the app doesn't configure one. */
  const __CONSOLE_BRAND__: ConsoleBrandConfig;
}
