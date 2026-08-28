/** Overrides the console sidebar/header's default "Ratchet console" heading. Both fields are
 * optional — set either or both. Baked into the console client bundle at build time the same way
 * `consolePath` is (see `FrameworkConfig.consolePath`), since `ConsoleApp` has no other runtime
 * config channel; changing either requires a rebuild. */
export interface ConsoleBrandConfig {
  name?: string;
  /** an absolute URL (including `data:`) for the sidebar/header logo — the built console client is
   * a static bundle with no bundler-relative asset pipeline of its own to resolve a local file
   * path against. */
  logoUrl?: string;
}

export interface FrameworkConfig {
  db: {
    /** e.g. `process.env.DATABASE_URL!` — kept out of the config file as a literal (Q8-adjacent hygiene). */
    connectionString: string;
  };
  /** default: 'models' */
  modelsDir?: string;
  /** default: '.ratchet' — gitignored, rebuilt by `generate` every time */
  generatedDir?: string;
  /** default: 'migrations' — git-tracked; separate from generatedDir (Q8) */
  migrationsDir?: string;
  /** default: '/console' — where the console SPA (and its `/meta/models` metadata API) is
   * mounted. Must start with '/', have no trailing slash (except the bare '/' root value), and
   * must not collide with the framework's own '/api' or '/api/auth' routers — '/' mounts the
   * console as the app's catch-all fallback, coexisting with '/api'/'/api/auth' which still take
   * precedence. Baked into the console client bundle at build time (see `ratchet build`/`dev`),
   * so changing it requires a rebuild. */
  consolePath?: string;
  /** default: none (falls back to "Ratchet console") — see `ConsoleBrandConfig`. */
  brand?: ConsoleBrandConfig;
}

export function defineConfig(config: FrameworkConfig): FrameworkConfig {
  return config;
}
