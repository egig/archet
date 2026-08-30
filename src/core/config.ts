/** Overrides the console sidebar/header's default "Ratchet console" heading. Both fields are
 * optional — set either or both. Baked into the console client bundle at build time the same way
 * `consolePath` is (see `FrameworkConfig.consolePath`), since `ConsoleApp` has no other runtime
 * config channel; changing either requires a rebuild. */
export interface ConsoleBrandConfig {
  name?: string;
  /** an absolute URL (including `data:`) for the sidebar/header logo — the built console client is
   * a static bundle with no bundler-relative asset pipeline of its own to resolve a local file
   * path against. */
  logoUrl?: string;
}

/** Declarative form of a `FileStorage` backend (see `core/storage.ts`) for `file` fields —
 * resolved by `buildStorageAdapter` (`ratchet/storage`, used by `ratchet serve` and any other
 * Node/Bun entry file) into a real flystorage `FileStorage`. Only backends constructible from
 * plain values (credentials, bucket names, ...) belong here — Cloudflare R2's binding can't be,
 * so the Cloudflare deploy target builds its `FileStorage` by hand regardless of this config
 * (see `example/deploy/cloudflare/worker.ts`). Each cloud driver's adapter package + SDK is a
 * peer dependency behind its own `ratchet/storage/*` subpath (`./s3`, `./gcs`, `./azure`) so
 * choosing one driver doesn't force every consumer to install every cloud SDK. */
export type StorageConfig =
  | {
      driver: 'local';
      /** default: `<generatedDir>/storage` */
      dir?: string;
    }
  | {
      driver: 's3';
      bucket: string;
      region?: string;
      /** set for S3-compatible services (Cloudflare R2's S3 API, MinIO, DigitalOcean Spaces,
       * Backblaze B2, ...) — omit for real AWS S3. */
      endpoint?: string;
      /** required by most S3-compatible services other than AWS itself. */
      forcePathStyle?: boolean;
      credentials?: { accessKeyId: string; secretAccessKey: string };
      /** key prefix applied to every object, e.g. to share one bucket across apps/environments. */
      prefix?: string;
    }
  | {
      driver: 'gcs';
      bucket: string;
      projectId?: string;
      /** path to a service-account key file — omit to use Application Default Credentials. */
      keyFilename?: string;
      /** inline service-account credentials, as an alternative to `keyFilename`. */
      credentials?: Record<string, unknown>;
      prefix?: string;
    }
  | {
      driver: 'azure';
      connectionString: string;
      containerName: string;
      prefix?: string;
    };

export interface FrameworkConfig {
  db: {
    /** e.g. `process.env.DATABASE_URL!` — kept out of the config file as a literal (Q8-adjacent hygiene). */
    connectionString: string;
  };
  /** `file` field blob backend — see `StorageConfig`. default: local fs under
   * `<generatedDir>/storage` (today's zero-config behavior), same as omitting this entirely. */
  storage?: StorageConfig;
  /** default: 'models' */
  modelsDir?: string;
  /** default: '.ratchet' — gitignored, rebuilt by `generate` every time */
  generatedDir?: string;
  /** default: 'migrations' — git-tracked; separate from generatedDir (Q8) */
  migrationsDir?: string;
  /** default: 'routes' — the developer's React Router data-mode site (see `src/web/`). Scanned by
   * `ratchet generate` (folder convention); the SSR router is mounted at `/` only when
   * `<routesDir>/root.tsx` exists. */
  routesDir?: string;
  /** default: 'public' — static files served at `/` (favicon.ico, robots.txt, /images/…), before
   * the web SSR catch-all. */
  publicDir?: string;
  /** default: '/console' — where the console SPA (and its `/meta/models` metadata API) is
   * mounted. Must start with '/', have no trailing slash (except the bare '/' root value), and
   * must not collide with the framework's own '/api' or '/api/auth' routers — '/' mounts the
   * console as the app's catch-all fallback, coexisting with '/api'/'/api/auth' which still take
   * precedence. Baked into the console client bundle at build time (see `ratchet build`/`dev`),
   * so changing it requires a rebuild. */
  consolePath?: string;
  /** default: none (falls back to "Ratchet console") — see `ConsoleBrandConfig`. */
  brand?: ConsoleBrandConfig;
}

export function defineConfig(config: FrameworkConfig): FrameworkConfig {
  return config;
}
