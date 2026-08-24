import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getMimeType } from 'hono/utils/mime';
import type { AdminAsset, AdminAssetSource, AdminManifest } from './router.js';

function isEnoent(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Default `AdminAssetSource` for Node: reads the manifest and built assets straight off disk from
 * `<generatedDir>/admin`, matching what `ratchet dev`/`ratchet serve`/`ratchet build`'s bundle did
 * before asset serving became pluggable. Kept out of `ratchet/admin` (which stays fs-free for edge
 * callers) as its own subpath, `ratchet/admin/node`. */
export function createNodeFsAssetSource(generatedDir: string): AdminAssetSource {
  const adminDir = path.join(generatedDir, 'admin');
  const assetsDir = path.join(adminDir, 'assets');

  return {
    async getManifest(): Promise<AdminManifest | null> {
      try {
        const raw = await readFile(path.join(adminDir, 'manifest.json'), 'utf8');
        return JSON.parse(raw) as AdminManifest;
      } catch (err) {
        if (isEnoent(err)) return null;
        throw err;
      }
    },

    async getAsset(assetPath: string): Promise<AdminAsset | null> {
      const filePath = path.join(assetsDir, assetPath);
      const rel = path.relative(assetsDir, filePath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return null; // path traversal guard

      try {
        const body = await readFile(filePath);
        return { body, contentType: getMimeType(filePath) ?? 'application/octet-stream' };
      } catch (err) {
        if (isEnoent(err)) return null;
        throw err;
      }
    },
  };
}
