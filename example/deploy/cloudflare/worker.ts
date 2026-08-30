/**
 * Cloudflare Worker entry point — mounts the same `/api`, `/api/auth`, and console (`/console` by
 * default — see `ratchet.config.ts`'s `consolePath`) routes as `ratchet serve`, on Cloudflare's
 * edge network. This is a user-owned entry file, not something `ratchet build` generates (see
 * docs/guide/deploy.md) — deploy it yourself with `wrangler deploy`, after `ratchet build` has
 * produced `.ratchet/registry.ts` and `.ratchet/console/`.
 *
 * DB: postgres.js through a Hyperdrive binding, Cloudflare's documented way to reach a regular TCP
 * Postgres from a Worker (Hyperdrive pools upstream, so a fresh client per request is the
 * recommended, cheap pattern — see wrangler.jsonc's `hyperdrive` binding and `compatibility_flags:
 * ["nodejs_compat"]`).
 *
 * Console assets: Cloudflare Workers Static Assets (wrangler.jsonc's `assets` field, pointed at
 * `.ratchet/console`) serves the built JS/CSS/manifest straight off Cloudflare's CDN — `env.ASSETS`
 * below just adapts that binding to ratchet's `ConsoleAssetSource` interface.
 *
 * File storage: `env.FILES` is a native R2 bucket binding (wrangler.jsonc's `r2_buckets`) —
 * `R2StorageAdapter` below implements flystorage's `StorageAdapter` contract directly against
 * it, wrapped in a `FileStorage` the same way `ratchet/storage/s3`'s `createS3Storage` wraps
 * `AwsS3StorageAdapter`. This can't just reuse `ratchet/storage/s3` pointed at R2's S3-compatible
 * API instead: that would trade the free binding (no egress charges, no separate credentials)
 * for an HTTP round trip authenticated with R2 API tokens — not a good trade for something
 * already running inside the very Worker the binding is scoped to. Neither uses `FrameworkConfig`
 * for this: R2's binding only exists inside a Worker's `fetch` handler, so it can't be resolved
 * from a plain config value the way `db.connectionString` can (see `core/storage.ts`'s
 * `FileStorage` doc comment) — this file constructs and injects the concrete adapter itself.
 * Only `write`/`read`/`deleteFile` are real — those are the only three `StorageAdapter` methods
 * `createApiRouter` ever calls (see `router/create-router.ts`); every other method the interface
 * requires is stubbed to throw, since ratchet never reaches them.
 *
 * The literal `'/console'` below must match `consolePath` in `ratchet.config.ts` if you've
 * customized it (see docs/guide/console.md) — ratchet doesn't patch this file for you.
 */
import { Readable } from 'node:stream';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { FileStorage, FileWasNotFound, type StatEntry, type StorageAdapter } from '@flystorage/file-storage';
import { App, createApiRouter, buildRegistryMap } from '@egig/ratchet/router';
import { createAuthRouter } from '@egig/ratchet/auth';
import { createConsoleRouter, type ConsoleAsset, type ConsoleAssetSource, type ConsoleManifest } from '@egig/ratchet/console';
import { createWebsiteRouter } from '@egig/ratchet/website';
import * as registryModule from '../../.ratchet/registry.js';

const CONSOLE_PATH = '/console';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

interface Env {
  HYPERDRIVE: { connectionString: string };
  ASSETS: AssetsBinding;
  FILES: R2Bucket;
}

function notSupported(method: string): Error {
  return new Error(`R2StorageAdapter.${method}() is not implemented — createApiRouter never calls it`);
}

/** flystorage `StorageAdapter` over a native R2 binding. Only `write`/`read`/`deleteFile` do real
 * work; every other method the interface requires is a stub (see this file's top doc comment for
 * why that's safe here). */
class R2StorageAdapter implements StorageAdapter {
  constructor(private readonly bucket: R2Bucket) {}

  async write(path: string, contents: Readable, options: { mimeType?: string }): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of contents) chunks.push(chunk as Buffer);
    await this.bucket.put(path, Buffer.concat(chunks), { httpMetadata: { contentType: options.mimeType } });
  }

  async read(path: string): Promise<Readable> {
    const obj = await this.bucket.get(path);
    if (!obj) throw FileWasNotFound.atLocation(path, {});
    return Readable.from(Buffer.from(await obj.arrayBuffer()));
  }

  async deleteFile(path: string): Promise<void> {
    await this.bucket.delete(path);
  }

  async fileExists(path: string): Promise<boolean> {
    return (await this.bucket.get(path)) !== null;
  }

  createDirectory(): Promise<void> {
    throw notSupported('createDirectory');
  }
  copyFile(): Promise<void> {
    throw notSupported('copyFile');
  }
  moveFile(): Promise<void> {
    throw notSupported('moveFile');
  }
  stat(): Promise<StatEntry> {
    throw notSupported('stat');
  }
  list(): AsyncGenerator<StatEntry> {
    throw notSupported('list');
  }
  changeVisibility(): Promise<void> {
    throw notSupported('changeVisibility');
  }
  visibility(): Promise<string> {
    throw notSupported('visibility');
  }
  deleteDirectory(): Promise<void> {
    throw notSupported('deleteDirectory');
  }
  directoryExists(): Promise<boolean> {
    throw notSupported('directoryExists');
  }
  publicUrl(): Promise<string> {
    throw notSupported('publicUrl');
  }
  temporaryUrl(): Promise<string> {
    throw notSupported('temporaryUrl');
  }
  checksum(): Promise<string> {
    throw notSupported('checksum');
  }
  mimeType(): Promise<string> {
    throw notSupported('mimeType');
  }
  lastModified(): Promise<number> {
    throw notSupported('lastModified');
  }
  fileSize(): Promise<number> {
    throw notSupported('fileSize');
  }
}

/** `directory` in wrangler.jsonc points straight at `.ratchet/console`, so paths here are
 * relative to that (no console-path prefix) — `manifest.json` at the root, assets under `/assets/`. */
function createAssetsBindingSource(assets: AssetsBinding): ConsoleAssetSource {
  return {
    async getManifest(): Promise<ConsoleManifest | null> {
      const res = await assets.fetch(new Request('https://assets.local/manifest.json'));
      if (!res.ok) return null;
      return (await res.json()) as ConsoleManifest;
    },
    async getAsset(assetPath: string): Promise<ConsoleAsset | null> {
      const res = await assets.fetch(new Request(`https://assets.local/assets/${assetPath}`));
      if (!res.ok) return null;
      return {
        body: await res.arrayBuffer(),
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      };
    },
  };
}

const registry = buildRegistryMap(registryModule as Record<string, unknown>);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Hyperdrive pools upstream — a fresh client per request is Cloudflare's documented, cheap
    // pattern here, not a mistake. `fetch_types: false` skips a pg_catalog round-trip ratchet's
    // generated schema doesn't need (no array-typed columns).
    const client = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
    const db = drizzle(client);

    // `/api/auth` and `/api` are registered before the console router so they keep precedence if
    // `CONSOLE_PATH` is ever set to '/' (root mount) — its own catch-all would otherwise swallow
    // every path (see `FrameworkConfig.consolePath`). The website router (public page rendering)
    // goes last of all — see `src/website/router.ts`'s doc comment for why mount order is what
    // keeps a page slug from ever shadowing `/api`/the console.
    const app = new App();
    app.route('/api/auth', createAuthRouter(db));
    app.route('/api', createApiRouter(registry, db, new FileStorage(new R2StorageAdapter(env.FILES))));
    app.route(CONSOLE_PATH, createConsoleRouter(createAssetsBindingSource(env.ASSETS), registry, db, CONSOLE_PATH));
    app.route('/', createWebsiteRouter(db));

    return app.fetch(request);
  },
};
