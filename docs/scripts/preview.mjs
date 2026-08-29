// Local preview of the production build, served under /ratchet/ the same way
// GitHub Pages does — `serve ./build/client` alone would serve it at the root
// instead, where the /ratchet/-prefixed asset URLs baked into the HTML 404.
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const docsDir = path.resolve(import.meta.dirname, '..');
const root = mkdtempSync(path.join(tmpdir(), 'ratchet-docs-preview-'));

try {
  symlinkSync(path.join(docsDir, 'build', 'client'), path.join(root, 'ratchet'));

  const result = spawnSync(
    path.join(docsDir, 'node_modules', '.bin', 'serve'),
    [root, '--config', path.join(docsDir, 'serve.json')],
    { stdio: 'inherit' },
  );

  process.exit(result.status ?? 0);
} finally {
  rmSync(root, { recursive: true, force: true });
}
