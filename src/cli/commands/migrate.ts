import { mkdir } from 'node:fs/promises';
import { generate } from '../../codegen/generate.js';
import { loadConfig, resolveDirs } from '../load-config.js';
import { writeDrizzleKitConfig } from '../drizzle-kit-config.js';
import { runDrizzleKit } from '../run-drizzle-kit.js';

export async function runMigrate(cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const { modelsDir, generatedDir, migrationsDir } = resolveDirs(cwd, config);

  // Keep schema.ts fresh before diffing — `migrate` always reflects the current model files.
  await generate({ modelsDir, generatedDir });
  await mkdir(migrationsDir, { recursive: true });

  const drizzleConfigFile = await writeDrizzleKitConfig(cwd, generatedDir, migrationsDir);

  // §7: reviewable SQL files (generate), then apply + track them (migrate) — never `push`
  // outside local dev.
  await runDrizzleKit(['generate', '--config', drizzleConfigFile], cwd);
  await runDrizzleKit(['migrate', '--config', drizzleConfigFile], cwd);
}
