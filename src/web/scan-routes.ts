import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Scans `routesDir` (the developer's React Router data-mode site) and turns the folder convention
 * into a route tree — the input `routes-gen.ts` turns into `.ratchet/app-routes.server.ts` and
 * `.ratchet/app-routes.client.ts`.
 *
 * Folder convention (docs/adr/0003):
 *   root.tsx                    the reserved root route — renders the full <html>
 *   index.tsx                   index route of its parent
 *   about.tsx                   path "about"
 *   $slug.tsx                   path ":slug"   ($ prefix = dynamic segment)
 *   $.tsx                       splat "*"      (bare $)
 *   blog/_layout.tsx  (or blog.tsx sibling)   layout component wrapping /blog/*
 *   blog/... (no _layout)       "blog" is a path-only prefix route (renders <Outlet/>)
 *   _marketing/...  (leading _ folder)        pathless layout group — contributes no URL segment
 *   sitemap[.]xml.tsx           path "sitemap.xml"  ([x] escapes a literal character)
 *
 * A module exporting `loader`/`action` but no `default` is a resource route (raw Response, no
 * render). Never imports/executes route modules — export names come from `Bun.Transpiler().scan()`.
 */

export const SERVER_ONLY_EXPORTS = ['loader', 'action', 'headers'] as const;

const ROUTE_FILE_RE = /\.(tsx|ts|jsx|js)$/;
const IGNORE_FILE_RE = /(\.d\.ts|\.test\.[jt]sx?|\.spec\.[jt]sx?)$/;

export interface RouteModule {
  /** absolute path of the route module file */
  file: string;
  /** stable route id — posix path relative to routesDir, no extension (`root` for root.tsx) */
  id: string;
  /** every named export the module declares (from a static scan, module never executed) */
  exports: string[];
}

export interface RouteNode {
  /** route id — a module id, or a synthetic `<folder>/` id for a path-only prefix route */
  id: string;
  /** the module backing this route, if any (a prefix route with no `_layout` has none) */
  module?: RouteModule;
  /** RR `path` — omitted for index routes and pathless layout groups */
  path?: string;
  index?: boolean;
  children?: RouteNode[];
}

export interface ScannedRoutes {
  /** absolute path of `<routesDir>/root.tsx`, or null when the site is not opted into */
  rootFile: string | null;
  /** the root route's own module info (exports etc.), when `rootFile` is set */
  root: RouteModule | null;
  /** the root route's children — the whole tree under routesDir minus root.tsx */
  tree: RouteNode[];
  /** flat list of every module in the tree (excluding root) — for import generation */
  modules: RouteModule[];
}

/** `$slug` -> `:slug`, `$` -> `*`, `sitemap[.]xml` -> `sitemap.xml`, else the literal name. */
export function segmentFromName(name: string): string {
  if (name === '$') return '*';
  const dynamic = name.startsWith('$');
  const literal = (dynamic ? name.slice(1) : name).replace(/\[(.)\]/g, '$1');
  return dynamic ? `:${literal}` : literal;
}

function baseName(file: string): string {
  return file.replace(ROUTE_FILE_RE, '');
}

function isRouteFile(name: string): boolean {
  return ROUTE_FILE_RE.test(name) && !IGNORE_FILE_RE.test(name);
}

function fileNameCompare(a: string, b: string): number {
  const aIndex = baseName(a) === 'index';
  const bIndex = baseName(b) === 'index';
  if (aIndex !== bIndex) return aIndex ? -1 : 1;
  return a.localeCompare(b);
}

async function scanModule(file: string, routesDir: string): Promise<RouteModule> {
  const source = await readFile(file, 'utf8');
  const loader = file.endsWith('x') ? 'tsx' : 'ts';
  const { exports } = new Bun.Transpiler({ loader }).scan(source);
  const id = path.relative(routesDir, file).replace(ROUTE_FILE_RE, '').split(path.sep).join('/');
  return { file, id, exports };
}

export function isResourceRoute(mod: RouteModule): boolean {
  return !mod.exports.includes('default') && (mod.exports.includes('loader') || mod.exports.includes('action'));
}

function assertHasComponentOrIsResource(mod: RouteModule): void {
  if (mod.exports.includes('default') || isResourceRoute(mod)) return;
  throw new Error(
    `route module '${mod.file}' has no \`default\` export — a route module must export a component, ` +
      `or (for a resource route) a \`loader\`/\`action\` and no component.`,
  );
}

interface DirScan {
  routes: RouteNode[];
  /** the `_layout` module inside this directory, consumed by the parent as this dir's layout */
  layout?: RouteModule;
}

async function scanDir(dir: string, routesDir: string): Promise<DirScan> {
  // `readdir` order is filesystem-dependent (not guaranteed alphabetical) — sort explicitly so the
  // generated route tree, and thus `.ratchet/app-routes.*.ts`, is deterministic across machines/runs.
  // `index` sorts first within its directory (it has no path of its own to alphabetize by, and
  // conventionally reads as "this folder's default").
  const entries = await readdir(dir, { withFileTypes: true });
  const fileNames = entries
    .filter((e) => e.isFile() && isRouteFile(e.name))
    .map((e) => e.name)
    .sort(fileNameCompare);
  const dirNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const isFolderName = new Set(dirNames);

  const routes: RouteNode[] = [];
  let layout: RouteModule | undefined;

  for (const name of fileNames) {
    const base = baseName(name);
    if (base === 'root' && dir === routesDir) continue; // handled by scanRoutes
    if (base === '_layout') {
      layout = await scanModule(path.join(dir, name), routesDir);
      continue;
    }
    if (isFolderName.has(base)) continue; // sibling-file layout for `<base>/`, consumed below

    const mod = await scanModule(path.join(dir, name), routesDir);
    assertHasComponentOrIsResource(mod);
    if (base === 'index') {
      routes.push({ id: mod.id, module: mod, index: true });
    } else {
      routes.push({ id: mod.id, module: mod, path: segmentFromName(base) });
    }
  }

  for (const name of dirNames) {
    const childDir = path.join(dir, name);
    const child = await scanDir(childDir, routesDir);

    let folderLayout = child.layout;
    const siblingLayoutName = fileNames.find((f) => baseName(f) === name);
    if (folderLayout && siblingLayoutName) {
      throw new Error(
        `folder '${childDir}' has both a '_layout' file and a '${name}' sibling file — use one or the other as its layout.`,
      );
    }
    if (!folderLayout && siblingLayoutName) {
      folderLayout = await scanModule(path.join(dir, siblingLayoutName), routesDir);
    }
    if (folderLayout) assertHasComponentOrIsResource(folderLayout);

    const relId = path.relative(routesDir, childDir).split(path.sep).join('/');
    const node: RouteNode = {
      id: folderLayout ? folderLayout.id : `${relId}/`,
      module: folderLayout,
      children: child.routes,
    };
    if (!name.startsWith('_')) node.path = segmentFromName(name);
    routes.push(node);
  }

  return { routes, layout };
}

function collectModules(nodes: RouteNode[], out: RouteModule[]): void {
  for (const node of nodes) {
    if (node.module) out.push(node.module);
    if (node.children) collectModules(node.children, out);
  }
}

function assertNoDuplicatePaths(nodes: RouteNode[], prefix = ''): void {
  const seen = new Map<string, string>();
  for (const node of nodes) {
    const key = node.index ? `${prefix}(index)` : node.path !== undefined ? `${prefix}${node.path}` : null;
    if (key !== null) {
      if (seen.has(key)) {
        throw new Error(`two routes resolve to the same path '${key}': '${seen.get(key)}' and '${node.id}'`);
      }
      seen.set(key, node.id);
    }
    if (node.children) assertNoDuplicatePaths(node.children, node.path ? `${prefix}${node.path}/` : prefix);
  }
}

export async function scanRoutes(routesDir: string): Promise<ScannedRoutes> {
  const rootFile = ['root.tsx', 'root.jsx', 'root.ts', 'root.js']
    .map((n) => path.join(routesDir, n))
    .find((p) => existsSync(p));

  if (!existsSync(routesDir) || !rootFile) {
    return { rootFile: null, root: null, tree: [], modules: [] };
  }

  const root = await scanModule(rootFile, routesDir);
  if (!root.exports.includes('default')) {
    throw new Error(`'${rootFile}' must have a \`default\` export — it renders the site's <html> document.`);
  }

  const { routes } = await scanDir(routesDir, routesDir);
  assertNoDuplicatePaths(routes);

  const modules: RouteModule[] = [];
  collectModules(routes, modules);

  return { rootFile, root, tree: routes, modules };
}
