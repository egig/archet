export interface FrameworkConfig {
  db: {
    /** e.g. `process.env.DATABASE_URL!` — kept out of the config file as a literal (Q8-adjacent hygiene). */
    connectionString: string;
  };
  /** default: 'models' */
  modelsDir?: string;
  /** default: '.arche' — gitignored, rebuilt by `generate` every time */
  generatedDir?: string;
  /** default: 'drizzle/migrations' — git-tracked; separate from generatedDir (Q8) */
  migrationsDir?: string;
  /** default: 'admin/client/main.tsx' — the consumer-authored admin UI entry point that
   * `arche build`/`arche dev` bundle with esbuild. Absent entirely if the app hasn't
   * adopted the admin feature — `build`/`dev` skip the admin build step in that case. */
  adminEntry?: string;
}

export function defineConfig(config: FrameworkConfig): FrameworkConfig {
  return config;
}
