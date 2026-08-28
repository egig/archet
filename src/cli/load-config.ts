import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FrameworkConfig } from '../core/config.js';

export async function loadConfig(cwd: string): Promise<FrameworkConfig> {
  const configPath = path.join(cwd, 'ratchet.config.ts');
  const moduleUrl = pathToFileURL(configPath).href;
  const mod = (await import(moduleUrl)) as { default?: FrameworkConfig };
  if (!mod.default) {
    throw new Error(`${configPath} must have a default export — use export default defineConfig({ ... })`);
  }
  return mod.default;
}

/** Rejects anything that can't be an unambiguous Hono mount prefix, or that would shadow (or be
 * shadowed by) the framework's own '/api' and '/api/auth' routers — see `FrameworkConfig.consolePath`. */
function resolveConsolePath(config: FrameworkConfig): string {
  const consolePath = config.consolePath ?? '/console';
  if (!consolePath.startsWith('/')) {
    throw new Error(`consolePath must start with '/', got '${consolePath}'`);
  }
  if (consolePath !== '/' && consolePath.endsWith('/')) {
    throw new Error(`consolePath must not have a trailing slash, got '${consolePath}'`);
  }
  if (consolePath === '/api' || consolePath === '/api/auth' || consolePath.startsWith('/api/')) {
    throw new Error(`consolePath '${consolePath}' collides with the framework's '/api'/'/api/auth' routers`);
  }
  return consolePath;
}

export function resolveDirs(cwd: string, config: FrameworkConfig) {
  return {
    modelsDir: path.resolve(cwd, config.modelsDir ?? 'models'),
    generatedDir: path.resolve(cwd, config.generatedDir ?? '.ratchet'),
    migrationsDir: path.resolve(cwd, config.migrationsDir ?? 'migrations'),
    consolePath: resolveConsolePath(config),
    brand: config.brand ?? {},
  };
}
