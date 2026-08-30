import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getMimeType } from '../router/mime.js';
import type { ConsoleAsset, ConsoleAssetSource, ConsoleManifest } from './router.js';

function isEnoent(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Default `ConsoleAssetSource` for Node: reads the manifest and built assets straight off disk
 * from `<generatedDir>/console`, matching what `ratchet dev`/`ratchet serve`/`ratchet build`'s
 * bundle did before asset serving became pluggable. Kept out of `ratchet/console` (which stays
 * fs-free for edge callers) as its own subpath, `ratchet/console/node`. */
export function createNodeFsAssetSource(generatedDir: string): ConsoleAssetSource {
  const consoleDir = path.join(generatedDir, 'console');
  const assetsDir = path.join(consoleDir, 'assets');

  return {
    async getManifest(): Promise<ConsoleManifest | null> {
      try {
        const raw = await readFile(path.join(consoleDir, 'manifest.json'), 'utf8');
        return JSON.parse(raw) as ConsoleManifest;
      } catch (err) {
        if (isEnoent(err)) return null;
        throw err;
      }
    },

    async getAsset(assetPath: string): Promise<ConsoleAsset | null> {
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
