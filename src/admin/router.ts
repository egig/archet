import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

interface AdminManifest {
  'main.js': string;
  'main.css'?: string;
}

function loadManifest(generatedDir: string): AdminManifest | null {
  const manifestFile = path.join(generatedDir, 'admin', 'manifest.json');
  if (!existsSync(manifestFile)) return null;
  return JSON.parse(readFileSync(manifestFile, 'utf8')) as AdminManifest;
}

function renderShell(manifest: AdminManifest): string {
  const css = manifest['main.css'] ? `<link rel="stylesheet" href="./${manifest['main.css']}">` : '';
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<title>archet admin</title>',
    css,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script type="module" src="./${manifest['main.js']}"></script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

/** `/admin/*` — serves the admin UI shell + its built assets, resolved via the manifest
 * `archet build`/`archet dev` write to `<generatedDir>/admin/manifest.json` (see
 * src/cli/build-admin.ts). Mirrors src/auth/router.ts's `createXRouter(...) -> Hono` shape. */
export function createAdminRouter(generatedDir: string): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const manifest = loadManifest(generatedDir);
    if (!manifest) {
      return c.text(
        'admin UI not built yet — run `archet build` or `archet dev` (requires an admin/client/main.tsx entry)',
        503,
      );
    }
    return c.html(renderShell(manifest));
  });

  app.use(
    '/assets/*',
    serveStatic({
      root: path.relative(process.cwd(), path.join(generatedDir, 'admin')),
      // `app.route('/admin', ...)` in serve.ts prefixes matching but not `c.req.path` — strip it
      // ourselves so `root` + rewritten path lands on `<generatedDir>/admin/assets/...`.
      rewriteRequestPath: (p) => p.replace(/^\/admin/, ''),
    }),
  );

  return app;
}
