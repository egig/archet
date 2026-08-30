import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { scanRoutes } from '../src/web/scan-routes.js';
import { generateServerRoutesSource } from '../src/web/routes-gen.js';
import { createWebServer } from '../src/web/server.js';
import type { RouteObject } from 'react-router';

const WEB_PKG = pathToFileURL(path.resolve(import.meta.dir, '../src/web/index.ts')).href;

const ROOT = `
import { Outlet } from 'react-router';
import { Meta, Scripts } from '${WEB_PKG}';
export default function Root() {
  return (
    <html lang="en"><head><meta charSet="utf-8" /><title>Test Site</title><Meta /></head>
    <body><main><Outlet /></main><Scripts /></body></html>
  );
}
`;
const INDEX = `
export const meta = () => [{ title: 'Home' }];
export default function Home() { return <h1>hello from home</h1>; }
`;
const ABOUT_WITH_LOADER = `
import { useLoaderData } from 'react-router';
export function loader() { return { tagline: 'we make things' }; }
export default function About() {
  const data = useLoaderData();
  return <p>{data.tagline}</p>;
}
`;
const SITEMAP = `
export function loader() {
  return new Response('<urlset/>', { headers: { 'content-type': 'application/xml' } });
}
`;
const REDIRECTOR = `
import { redirect } from 'react-router';
export function loader() { throw redirect('/'); }
export default function R() { return null; }
`;

// fixtures live under the repo (not os.tmpdir()) so `react`/`react-router` resolve from the
// repo's own node_modules.
const TMP_ROOT = path.resolve(import.meta.dir, '.tmp');

async function buildServer(files: Record<string, string>) {
  await mkdir(TMP_ROOT, { recursive: true });
  const routesDir = await mkdtemp(path.join(TMP_ROOT, 'ssr-routes-'));
  const genDir = await mkdtemp(path.join(TMP_ROOT, 'ssr-gen-'));
  for (const [name, contents] of Object.entries(files)) {
    const fp = path.join(routesDir, name);
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, contents, 'utf8');
  }
  const scanned = await scanRoutes(routesDir);
  const serverFile = path.join(genDir, 'app-routes.server.ts');
  await writeFile(serverFile, generateServerRoutesSource(scanned, genDir, WEB_PKG), 'utf8');
  const { routes, resourceRouteIds } = (await import(pathToFileURL(serverFile).href + `?t=${Date.now()}`)) as {
    routes: RouteObject[];
    resourceRouteIds: ReadonlySet<string>;
  };
  const server = createWebServer(
    routes,
    { db: {} as any, registry: {}, domainSettingsRegistry: {}, storage: undefined },
    '/_ratchet/entry.client.js',
    resourceRouteIds,
  );
  return { server, routesDir, genDir };
}

describe('web SSR handler', () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it('renders the document for / with SSR content, a title from meta, and the hydration script', async () => {
    const { server, routesDir, genDir } = await buildServer({ 'root.tsx': ROOT, 'index.tsx': INDEX });
    cleanup.push(routesDir, genDir);
    const res = await server.handle(new Request('http://localhost/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toStartWith('<!DOCTYPE html>');
    expect(html).toContain('hello from home');
    expect(html).toContain('<title>Home</title>');
    expect(html).toContain('__staticRouterHydrationData');
    expect(html).toContain('/_ratchet/entry.client.js');
  });

  it('runs a server loader and reflects its data in the SSR output', async () => {
    const { server, routesDir, genDir } = await buildServer({ 'root.tsx': ROOT, 'about.tsx': ABOUT_WITH_LOADER });
    cleanup.push(routesDir, genDir);
    const res = await server.handle(new Request('http://localhost/about'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('we make things');
  });

  it('returns a raw Response from a resource route (loader, no default)', async () => {
    const { server, routesDir, genDir } = await buildServer({ 'root.tsx': ROOT, 'sitemap[.]xml.tsx': SITEMAP });
    cleanup.push(routesDir, genDir);
    const res = await server.handle(new Request('http://localhost/sitemap.xml'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    expect(await res.text()).toBe('<urlset/>');
  });

  it('replays a redirect thrown from a loader', async () => {
    const { server, routesDir, genDir } = await buildServer({ 'root.tsx': ROOT, 'go.tsx': REDIRECTOR });
    cleanup.push(routesDir, genDir);
    const res = await server.handle(new Request('http://localhost/go'), );
    expect([301, 302]).toContain(res.status);
    expect(res.headers.get('location')).toBe('/');
  });

  it('renders a 404 through the default root ErrorBoundary for an unmatched path', async () => {
    const { server, routesDir, genDir } = await buildServer({ 'root.tsx': ROOT, 'index.tsx': INDEX });
    cleanup.push(routesDir, genDir);
    const res = await server.handle(new Request('http://localhost/nope'));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('404');
  });

  it('serves a loader result over .data as turbo-stream', async () => {
    const { server, routesDir, genDir } = await buildServer({ 'root.tsx': ROOT, 'about.tsx': ABOUT_WITH_LOADER });
    cleanup.push(routesDir, genDir);
    const res = await server.handle(new Request('http://localhost/about.data'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/x-turbo');
    const { decode } = await import('turbo-stream');
    const payload = (await decode(res.body!.pipeThrough(new TextDecoderStream()))) as Record<string, { data?: { tagline: string } }>;
    expect(payload['about']?.data?.tagline).toBe('we make things');
  });

  it('replays a loader redirect over .data with the x-ratchet-redirect header', async () => {
    const { server, routesDir, genDir } = await buildServer({ 'root.tsx': ROOT, 'go.tsx': REDIRECTOR });
    cleanup.push(routesDir, genDir);
    const res = await server.handle(new Request('http://localhost/go.data'));
    expect(res.headers.get('x-ratchet-redirect')).toBe('/');
  });
});
