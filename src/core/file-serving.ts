import { Readable } from 'node:stream';
import { UnableToReadFile, type FileStorage } from '@flystorage/file-storage';
import { PipelineError } from './pipeline.js';
import type { StoredFile } from './storage.js';

/** `inline` for anything the browser can render itself (images — the only content type either of
 * this file's two callers ever actually stores), `attachment` (forces a download) for everything
 * else. */
export function contentDisposition(file: StoredFile): string {
  const safeName = file.filename.replace(/["\r\n]/g, '');
  const disposition = file.mimeType.startsWith('image/') ? 'inline' : 'attachment';
  return `${disposition}; filename="${safeName}"`;
}

/** Streams a `file` field's blob back as an HTTP response — shared by `router/create-router.ts`'s
 * `GET /:model/:id/:field` (gated by that model's own `read` permission) and
 * `router/site-assets.ts`'s `GET /_site-assets/:domain/:field/:token` (unauthenticated, for a
 * `field.file({ public: true })` Domain Settings value). Both routes already know `stored` exists
 * and resolve their own 404s for "no such field"/"no value yet" before calling this — everything
 * from here on is the one thing they share: turning a `StoredFile` into bytes on the wire. A
 * missing blob (or any other `UnableToReadFile`) still maps to 404, logged with `context` (the
 * caller's own route + identifying params) so an operator can tell a real backend fault from an
 * ordinary "blob was deleted out from under this row" 404. `cacheControl` is opt-in, not a
 * shared default: `GET /:model/:id/:field`'s URL stays constant across a file being replaced (the
 * row `id` doesn't change), so caching it would serve stale bytes — only a content-addressed URL
 * (`site-assets.ts`, keyed by the storage key's own generated id) can safely set one. */
export async function streamStoredFile(
  storage: FileStorage,
  stored: StoredFile,
  context: string,
  cacheControl?: string,
): Promise<Response> {
  let nodeStream: Readable;
  try {
    nodeStream = await storage.read(stored.key);
  } catch (err) {
    if (err instanceof UnableToReadFile) {
      // eslint-disable-next-line no-console
      console.error(`${context}: storage.read('${stored.key}') failed`, err);
      throw new PipelineError({ code: 'NOT_FOUND', status: 404 });
    }
    throw err;
  }
  const headers: Record<string, string> = { 'content-type': stored.mimeType, 'content-disposition': contentDisposition(stored) };
  if (cacheControl) headers['cache-control'] = cacheControl;
  return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, { headers });
}
