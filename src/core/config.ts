export interface FrameworkConfig {
  db: {
    /** e.g. `process.env.DATABASE_URL!` — kept out of the config file as a literal (Q8-adjacent hygiene). */
    connectionString: string;
  };
  /** default: 'models' */
  modelsDir?: string;
  /** default: '.archet' — gitignored, rebuilt by `generate` every time */
  generatedDir?: string;
  /** default: 'drizzle/migrations' — git-tracked; separate from generatedDir (Q8) */
  migrationsDir?: string;
}

export function defineConfig(config: FrameworkConfig): FrameworkConfig {
  return config;
}
