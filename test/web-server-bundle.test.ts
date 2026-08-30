import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { buildServerBundle } from '../src/cli/build-console.js';

const REGISTRY_FIXTURE = 'export const models = {};\n';
const DOMAINS_FIXTURE = 'export const domains = {};\n';
const APP_ROUTES_SERVER_FIXTURE = 'export const routes = [];\nexport const resourceRouteIds = new Set();\n';

interface Fixture {
  cwd: string;
  dirs: {
    generatedDir: string;
    routesDir: string;
    publicDir: string;
    modelsDir: string;
    migrationsDir: string;
    consolePath: string;
    brand: Record<string, unknown>;
  };
}

async function makeFixture(withWeb: boolean): Promise<Fixture> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ratchet-server-bundle-'));
  const generatedDir = path.join(cwd, '.ratchet');
  await mkdir(generatedDir, { recursive: true });
  await writeFile(path.join(generatedDir, 'registry.ts'), REGISTRY_FIXTURE, 'utf8');
  await writeFile(path.join(generatedDir, 'domains.ts'), DOMAINS_FIXTURE, 'utf8');
  if (withWeb) {
    await writeFile(path.join(generatedDir, 'app-routes.server.ts'), APP_ROUTES_SERVER_FIXTURE, 'utf8');
  }
  return {
    cwd,
    dirs: {
      generatedDir,
      routesDir: path.join(cwd, 'routes'),
      publicDir: path.join(cwd, 'public'),
      modelsDir: path.join(cwd, 'models'),
      migrationsDir: path.join(cwd, 'migrations'),
      consolePath: '/console',
      brand: {},
    },
  };
}

describe('buildServerBundle', () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it('does not mount the web app in the bundled server entry when the site is not opted into', async () => {
    const { cwd, dirs } = await makeFixture(false);
    cleanup.push(cwd);

    await buildServerBundle(cwd, dirs);

    const entrySrc = await readFile(path.join(dirs.generatedDir, 'server-entry.ts'), 'utf8');
    expect(entrySrc).not.toContain('createWebRouter');
    expect(entrySrc).not.toContain('/_ratchet');
    expect(entrySrc).not.toContain('@egig/ratchet/web/router');
    expect(entrySrc).toContain('createConsoleRouter');
    expect(existsSync(path.join(cwd, 'dist', 'server.js'))).toBe(true);
  });

  it('mounts /_ratchet and the web router (with publicDir folded in) in the bundled server entry when routes/root.tsx exists', async () => {
    const { cwd, dirs } = await makeFixture(true);
    cleanup.push(cwd);

    await buildServerBundle(cwd, dirs);

    const entrySrc = await readFile(path.join(dirs.generatedDir, 'server-entry.ts'), 'utf8');
    expect(entrySrc).toContain("import { createWebRouter, createWebAssetsRouter } from '@egig/ratchet/web/router';");
    expect(entrySrc).toContain("import { routes as webRoutes, resourceRouteIds } from './app-routes.server.js';");
    expect(entrySrc).toContain('createWebAssetsRouter(".ratchet")');
    expect(entrySrc).not.toContain('createPublicAssetsRouter');
    expect(entrySrc).toContain("app.route('/', createWebRouter({ routes: webRoutes, resourceRouteIds,");
    expect(entrySrc).toContain('publicDir: "public"');
    expect(entrySrc).toContain('entrySrc: "/_ratchet/entry.client.js"');
    expect(existsSync(path.join(cwd, 'dist', 'server.js'))).toBe(true);
  });
});
