import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { scanRoutes, segmentFromName, isResourceRoute } from '../src/web/scan-routes.js';
import type { RouteNode } from '../src/web/scan-routes.js';

const COMPONENT = 'export default function C() { return null; }\n';
const WITH_LOADER = 'export function loader() { return {}; }\n' + COMPONENT;
const RESOURCE = 'export function loader() { return new Response("x"); }\n';
const LAYOUT = 'export default function L() { return null; }\n';

async function writeRoutesDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ratchet-routes-'));
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, 'utf8');
  }
  return dir;
}

/** Flatten the tree to `id -> {path,index,hasModule,childIds}` for compact assertions. */
function flatten(nodes: RouteNode[], out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const n of nodes) {
    out[n.id] = {
      path: n.path,
      index: n.index ?? false,
      hasModule: Boolean(n.module),
      children: (n.children ?? []).map((c) => c.id),
    };
    if (n.children) flatten(n.children, out);
  }
  return out;
}

describe('segmentFromName', () => {
  it('maps the convention', () => {
    expect(segmentFromName('about')).toBe('about');
    expect(segmentFromName('$slug')).toBe(':slug');
    expect(segmentFromName('$')).toBe('*');
    expect(segmentFromName('sitemap[.]xml')).toBe('sitemap.xml');
    expect(segmentFromName('$userId')).toBe(':userId');
  });
});

describe('scanRoutes', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('returns an un-opted-in result when there is no root.tsx', async () => {
    dir = await writeRoutesDir({ 'index.tsx': COMPONENT });
    const scanned = await scanRoutes(dir);
    expect(scanned.rootFile).toBeNull();
    expect(scanned.tree).toEqual([]);
  });

  it('builds a flat tree of files under root', async () => {
    dir = await writeRoutesDir({
      'root.tsx': COMPONENT,
      'index.tsx': COMPONENT,
      'about.tsx': COMPONENT,
    });
    const scanned = await scanRoutes(dir);
    expect(scanned.rootFile).toBe(path.join(dir, 'root.tsx'));
    const flat = flatten(scanned.tree);
    expect(flat['index']).toMatchObject({ index: true, path: undefined });
    expect(flat['about']).toMatchObject({ index: false, path: 'about' });
  });

  it('nests a folder as a path-only prefix route when it has no _layout', async () => {
    dir = await writeRoutesDir({
      'root.tsx': COMPONENT,
      'blog/index.tsx': COMPONENT,
      'blog/$slug.tsx': COMPONENT,
    });
    const flat = flatten((await scanRoutes(dir)).tree);
    expect(flat['blog/']).toMatchObject({ path: 'blog', hasModule: false, children: ['blog/index', 'blog/$slug'] });
    expect(flat['blog/$slug']).toMatchObject({ path: ':slug' });
  });

  it('uses blog/_layout.tsx as the folder layout', async () => {
    dir = await writeRoutesDir({
      'root.tsx': COMPONENT,
      'blog/_layout.tsx': LAYOUT,
      'blog/index.tsx': COMPONENT,
    });
    const flat = flatten((await scanRoutes(dir)).tree);
    expect(flat['blog/_layout']).toMatchObject({ path: 'blog', hasModule: true, children: ['blog/index'] });
  });

  it('uses a blog.tsx sibling file as the folder layout', async () => {
    dir = await writeRoutesDir({
      'root.tsx': COMPONENT,
      'blog.tsx': LAYOUT,
      'blog/index.tsx': COMPONENT,
    });
    const flat = flatten((await scanRoutes(dir)).tree);
    expect(flat['blog']).toMatchObject({ path: 'blog', hasModule: true, children: ['blog/index'] });
  });

  it('treats a leading-underscore folder as a pathless layout group', async () => {
    dir = await writeRoutesDir({
      'root.tsx': COMPONENT,
      '_marketing/_layout.tsx': LAYOUT,
      '_marketing/pricing.tsx': COMPONENT,
    });
    const flat = flatten((await scanRoutes(dir)).tree);
    expect(flat['_marketing/_layout']).toMatchObject({ path: undefined, hasModule: true, children: ['_marketing/pricing'] });
    expect(flat['_marketing/pricing']).toMatchObject({ path: 'pricing' });
  });

  it('maps the splat file to *', async () => {
    dir = await writeRoutesDir({ 'root.tsx': COMPONENT, '$.tsx': COMPONENT });
    const flat = flatten((await scanRoutes(dir)).tree);
    expect(flat['$']).toMatchObject({ path: '*' });
  });

  it('recognizes a resource route (loader, no default) and escapes the literal dot', async () => {
    dir = await writeRoutesDir({ 'root.tsx': COMPONENT, 'sitemap[.]xml.tsx': RESOURCE });
    const scanned = await scanRoutes(dir);
    const flat = flatten(scanned.tree);
    expect(flat['sitemap[.]xml']).toMatchObject({ path: 'sitemap.xml' });
    expect(isResourceRoute(scanned.modules.find((m) => m.id === 'sitemap[.]xml')!)).toBe(true);
  });

  it('collects server loader/action exports for manifest generation', async () => {
    dir = await writeRoutesDir({ 'root.tsx': COMPONENT, 'blog/$slug.tsx': WITH_LOADER });
    const scanned = await scanRoutes(dir);
    const mod = scanned.modules.find((m) => m.id === 'blog/$slug')!;
    expect(mod.exports).toContain('loader');
    expect(mod.exports).toContain('default');
  });

  it('rejects a non-resource route module with no default export', async () => {
    dir = await writeRoutesDir({ 'root.tsx': COMPONENT, 'broken.tsx': 'export const meta = () => [];\n' });
    await expect(scanRoutes(dir)).rejects.toThrow(/no `default` export/);
  });

  it('rejects a folder with both _layout and a sibling file', async () => {
    dir = await writeRoutesDir({
      'root.tsx': COMPONENT,
      'blog.tsx': LAYOUT,
      'blog/_layout.tsx': LAYOUT,
      'blog/index.tsx': COMPONENT,
    });
    await expect(scanRoutes(dir)).rejects.toThrow(/both a '_layout' file and a 'blog' sibling/);
  });
});
