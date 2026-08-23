import { loadConfig, resolveDirs } from '../load-config.js';
import { buildAdminClient, buildServerBundle } from '../build-admin.js';

/** Builds the admin client (esbuild + Tailwind, hashed + manifest — see build-admin.ts) and
 * a bundled server artifact (edge-runtime groundwork; does not affect `serve`/`dev`). */
export async function runBuild(cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const dirs = resolveDirs(cwd, config);

  await buildAdminClient(dirs, { watch: false, mode: 'prod' });
  await buildServerBundle(cwd, dirs);
}
