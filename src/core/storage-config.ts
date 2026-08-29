import type { FileStorage } from '@flystorage/file-storage';
import type { StorageConfig } from './config.js';

/**
 * Builds a `FileStorage` from `FrameworkConfig.storage` — the one place driver selection happens,
 * shared by `ratchet serve` (`cli/commands/serve.ts`) and any other Node/Bun entry file that
 * wants config-driven storage (e.g. a Vercel deployment — see `example/deploy/vercel/api/index.ts`).
 * Cloudflare Workers don't use this: R2's binding isn't a plain config value (only available
 * inside a Worker's `fetch` handler), and most cloud SDKs here aren't Workers-compatible anyway —
 * `example/deploy/cloudflare/worker.ts` builds its `FileStorage` by hand instead.
 *
 * Each driver's implementation lives behind its own `ratchet/storage/*` subpath and is only
 * `import()`-ed when that driver is actually selected, so picking `driver: 's3'` doesn't require
 * `@flystorage/google-cloud-storage`/`@flystorage/azure-storage-blob` (or their SDKs) to be
 * installed, and vice versa — only the one peer-dependency pair the app actually uses.
 *
 * Kept out of `ratchet/core` — its own subpath, `ratchet/storage`, mirrors `ratchet/storage/node`
 * (the `core/storage.ts` doc comment explains why `ratchet/core` itself stays free of any single
 * backend's dependencies).
 */
export async function buildStorageAdapter(config: StorageConfig | undefined, defaultLocalDir: string): Promise<FileStorage> {
  if (!config || config.driver === 'local') {
    const { createLocalStorage } = await import('./storage-node.js');
    return createLocalStorage(config?.dir ?? defaultLocalDir);
  }

  switch (config.driver) {
    case 's3': {
      const { createS3Storage } = await import('./storage-s3.js');
      return createS3Storage(config);
    }
    case 'gcs': {
      const { createGcsStorage } = await import('./storage-gcs.js');
      return createGcsStorage(config);
    }
    case 'azure': {
      const { createAzureStorage } = await import('./storage-azure.js');
      return createAzureStorage(config);
    }
    default: {
      const exhaustive: never = config;
      throw new Error(`unknown storage driver: ${JSON.stringify(exhaustive)}`);
    }
  }
}
