import { FileStorage } from '@flystorage/file-storage';
import { LocalStorageAdapter } from '@flystorage/local-fs';

/** Default `FileStorage` for Node/Bun: stores each blob as a plain file under `dir` (used by
 * `ratchet serve` when `FrameworkConfig.storage` is omitted or set to `{ driver: 'local' }` —
 * see `core/storage-config.ts`'s `buildStorageAdapter`). Kept out of `ratchet/core` (which stays
 * fs-free for edge callers) as its own subpath, `ratchet/storage/node` — mirrors
 * `ratchet/console/node`'s split for the same reason. `@flystorage/local-fs` has no cloud SDK of
 * its own, so — unlike the `./s3`/`./gcs`/`./azure` subpaths — this one is a plain dependency,
 * not an optional peer: it has to work with zero extra installs for the default, unconfigured
 * case to keep working. */
export function createLocalStorage(dir: string): FileStorage {
  return new FileStorage(new LocalStorageAdapter(dir));
}
