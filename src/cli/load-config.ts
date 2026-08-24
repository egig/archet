import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import type { FrameworkConfig } from '../core/config.js';

export async function loadConfig(cwd: string): Promise<FrameworkConfig> {
  const configPath = path.join(cwd, 'ratchet.config.ts');
  const moduleUrl = pathToFileURL(configPath).href;
  const mod = (await tsImport(moduleUrl, import.meta.url)) as { default?: FrameworkConfig };
  if (!mod.default) {
    throw new Error(`${configPath} must have a default export — use export default defineConfig({ ... })`);
  }
  return mod.default;
}

export function resolveDirs(cwd: string, config: FrameworkConfig) {
  return {
    modelsDir: path.resolve(cwd, config.modelsDir ?? 'models'),
    generatedDir: path.resolve(cwd, config.generatedDir ?? '.ratchet'),
    migrationsDir: path.resolve(cwd, config.migrationsDir ?? 'drizzle/migrations'),
    adminEntryFile: path.resolve(cwd, config.adminEntry ?? 'admin/client/main.tsx'),
  };
}
