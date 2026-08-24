export interface FrameworkConfig {
  db: {
    /** e.g. `process.env.DATABASE_URL!` — kept out of the config file as a literal (Q8-adjacent hygiene). */
    connectionString: string;
  };
  /** default: 'models' */
  modelsDir?: string;
  /** default: '.ratchet' — gitignored, rebuilt by `generate` every time */
  generatedDir?: string;
  /** default: 'drizzle/migrations' — git-tracked; separate from generatedDir (Q8) */
  migrationsDir?: string;
  /** default: 'console/client/main.tsx' — the consumer-authored console UI entry point that
   * `ratchet build`/`ratchet dev` bundle with esbuild. Absent entirely if the app hasn't
   * adopted the console feature — `build`/`dev` skip the console build step in that case. */
  consoleEntry?: string;
  /** default: '/console' — where the console SPA (and its `/meta/models` metadata API) is
   * mounted. Must start with '/', have no trailing slash (except the bare '/' root value), and
   * must not collide with the framework's own '/api' or '/api/auth' routers — '/' mounts the
   * console as the app's catch-all fallback, coexisting with '/api'/'/api/auth' which still take
   * precedence. Baked into the console client bundle at build time (see `ratchet build`/`dev`),
   * so changing it requires a rebuild. */
  consolePath?: string;
}

export function defineConfig(config: FrameworkConfig): FrameworkConfig {
  return config;
}
