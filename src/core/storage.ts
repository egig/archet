/** The value a `file` field's column holds (jsonb) — `key` addresses the blob in whatever
 * `FileStorage` the app configured; `filename`/`mimeType`/`size` are display metadata
 * captured at upload time. This is also the shape a client submits as the field's value on
 * create/update (see `core/validation.ts`), returned as-is by the upload endpoint
 * (`router/create-router.ts`). API responses that *read* a record never expose this shape
 * directly — `deriveFileFields` (`core/serialize.ts`) replaces `key` with a fetchable `url`
 * first, so a client can never see (or reuse) the raw storage key. */
export interface StoredFile {
  key: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** Blob backend for `file` fields — flystorage's own `FileStorage` facade
 * (`@flystorage/file-storage`), constructed by one of the `ratchet/storage/*` factories
 * (`./node` for local fs, `./s3`, `./gcs`, `./azure` for the well-known cloud backends) or
 * `buildStorageAdapter` (`ratchet/storage`) from a declarative `FrameworkConfig.storage`.
 * Passed directly into `createApiRouter` (constructor injection) rather than resolved from
 * `FrameworkConfig` internally — mirrors `ConsoleAssetSource` (`console/router.ts`) — because
 * unlike `db.connectionString` a storage backend isn't always constructible from a plain config
 * value at load time (Cloudflare R2 is an `env`-injected binding, only available inside a
 * Worker's `fetch` handler, so it stays hand-wired with its own flystorage `StorageAdapter` —
 * see `example/deploy/cloudflare/worker.ts`). Re-exported here so callers that only need the
 * type (e.g. `FrameworkConfig` consumers) don't have to add their own `@flystorage/file-storage`
 * import. */
export type { FileStorage } from '@flystorage/file-storage';

/** Applies when a `file` field omits `maxSize`. */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

const MAGIC_NUMBERS: { sig: number[]; mimeType: string }[] = [
  { sig: [0xff, 0xd8, 0xff], mimeType: 'image/jpeg' },
  { sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mimeType: 'image/png' },
  { sig: [0x47, 0x49, 0x46, 0x38], mimeType: 'image/gif' },
  { sig: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf' },
];

function matchesSignature(bytes: Uint8Array, sig: number[]): boolean {
  return sig.length <= bytes.length && sig.every((b, i) => bytes[i] === b);
}

/** WEBP is a RIFF container — 'RIFF' at byte 0, 'WEBP' at byte 8 — not a fixed-prefix signature. */
function isWebp(bytes: Uint8Array): boolean {
  return (
    matchesSignature(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    matchesSignature(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  );
}

/** Q15: the upload endpoint validates an `accept` restriction against these sniffed bytes, never
 * the client-declared Content-Type — a renamed/mislabeled upload would otherwise sail through an
 * `accept: 'image/*'` field and break `preview: 'image'` rendering (or worse, get served back as
 * if it were safe image content). Falls back to `declared` (or `application/octet-stream`) for
 * any type not in the (deliberately small) signature list above — this is "catch the easy
 * mislabeling case cheaply," not a general-purpose file-type library. */
export function sniffMimeType(bytes: Uint8Array, declared: string): string {
  for (const { sig, mimeType } of MAGIC_NUMBERS) {
    if (matchesSignature(bytes, sig)) return mimeType;
  }
  if (isWebp(bytes)) return 'image/webp';
  return declared || 'application/octet-stream';
}

/** `accept` is a comma-separated list of exact mime types or `type/*` wildcards (e.g.
 * `'image/*'`, `'image/png,application/pdf'`). */
export function matchesAccept(mimeType: string, accept: string): boolean {
  return accept.split(',').some((pattern) => {
    const trimmed = pattern.trim();
    if (trimmed.endsWith('/*')) return mimeType.startsWith(trimmed.slice(0, -1));
    return mimeType === trimmed;
  });
}
