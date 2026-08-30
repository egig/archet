import { decode, encode } from 'turbo-stream';
import {
  isRouteErrorResponse,
  UNSAFE_ErrorResponseImpl as ErrorResponseImpl,
  type DataStrategyFunction,
  type LoaderFunction,
} from 'react-router';

/**
 * Single fetch (docs/adr/0003). Loaders/actions run only on the server; the client gets their
 * results over one `GET`/`POST <path>.data` request per navigation, turbo-stream encoded.
 *
 *  - server: `encodeDataResponse` builds the `.data` body from a `StaticHandlerContext`
 *  - client: `createSingleFetchDataStrategy` is `createBrowserRouter`'s `dataStrategy` — it issues
 *    the one request and distributes results back to the matched routes
 *  - `singleFetchHandler(routeId)` is the sentinel attached to client routes with a server
 *    loader/action (its presence is what makes RR call `dataStrategy` for that route)
 */

const REDIRECT_HEADER = 'x-ratchet-redirect';
const REDIRECT_STATUS = 204;

interface WireEntry {
  data?: unknown;
  error?: { message: string; stack?: string };
  errorResponse?: { status: number; statusText: string; data: unknown };
}

function serializeError(value: unknown): WireEntry {
  if (isRouteErrorResponse(value)) {
    return { errorResponse: { status: value.status, statusText: value.statusText, data: value.data } };
  }
  if (value instanceof Error) return { error: { message: value.message, stack: value.stack } };
  return { error: { message: String(value) } };
}

function reviveError(entry: WireEntry): unknown {
  if (entry.errorResponse) {
    const { status, statusText, data } = entry.errorResponse;
    return new ErrorResponseImpl(status, statusText, data, true);
  }
  const err = new Error(entry.error?.message ?? 'Unknown error');
  if (entry.error?.stack) err.stack = entry.error.stack;
  return err;
}

/** the `.data` pathname for an in-app pathname (`/` -> `/_root.data`, RR's convention). */
export function dataPathname(pathname: string): string {
  if (pathname === '/') return '/_root.data';
  return pathname.replace(/\/?$/, '') + '.data';
}

/** strip the `.data` suffix back to the real route pathname (server side). */
export function routePathnameFromData(dataPathnameValue: string): string {
  if (dataPathnameValue === '/_root.data') return '/';
  return dataPathnameValue.replace(/\.data$/, '');
}

export interface StaticHandlerContextLike {
  loaderData: Record<string, unknown>;
  actionData: Record<string, unknown> | null;
  errors: Record<string, unknown> | null;
}

/** turbo-stream `.data` body from a `query()` result — `{ [routeId]: WireEntry }`. */
export function encodeDataResponse(context: StaticHandlerContextLike): Response {
  const payload: Record<string, WireEntry> = {};
  for (const [id, data] of Object.entries(context.loaderData ?? {})) payload[id] = { data };
  for (const [id, data] of Object.entries(context.actionData ?? {})) payload[id] = { data };
  for (const [id, error] of Object.entries(context.errors ?? {})) payload[id] = serializeError(error);
  const body = encode(payload).pipeThrough(new TextEncoderStream());
  return new Response(body, { headers: { 'content-type': 'text/x-turbo; charset=utf-8' } });
}

/** a `Response` telling the client dataStrategy to replay a redirect (a bare 3xx would be
 * auto-followed by `fetch` before the router ever sees it). */
export function encodeRedirectResponse(location: string, status = 302): Response {
  return new Response(null, { status: REDIRECT_STATUS, headers: { [REDIRECT_HEADER]: location, 'x-ratchet-redirect-status': String(status) } });
}

export function singleFetchHandler(routeId: string): LoaderFunction {
  return () => {
    throw new Error(
      `single-fetch sentinel for route '${routeId}' was invoked directly — the client dataStrategy ` +
        `should have intercepted this. This is a bug in @egig/ratchet/web.`,
    );
  };
}

export function createSingleFetchDataStrategy(): DataStrategyFunction {
  return async ({ request, matches }) => {
    const toLoad = matches.filter((m) => m.shouldLoad);
    if (toLoad.length === 0) return {};

    const url = new URL(request.url);
    const target = dataPathname(url.pathname) + url.search;
    const init: RequestInit = { method: request.method, signal: request.signal };
    if (request.method !== 'GET') {
      init.body = await request.clone().arrayBuffer();
      init.headers = request.headers;
    }

    const res = await fetch(target, init);

    if (res.headers.has(REDIRECT_HEADER)) {
      const location = res.headers.get(REDIRECT_HEADER)!;
      const out: Record<string, { type: 'error'; result: unknown }> = {};
      for (const m of toLoad) out[m.route.id] = { type: 'error', result: new Response(null, { status: 302, headers: { Location: location } }) };
      return out;
    }
    if (!res.body) throw new Error(`.data request to ${target} returned no body (${res.status})`);

    const decoded = await decode<Record<string, WireEntry>>(res.body.pipeThrough(new TextDecoderStream()));

    const out: Record<string, { type: 'data' | 'error'; result: unknown }> = {};
    for (const m of toLoad) {
      const entry = decoded[m.route.id];
      if (!entry) {
        out[m.route.id] = { type: 'data', result: undefined };
      } else if ('error' in entry || 'errorResponse' in entry) {
        out[m.route.id] = { type: 'error', result: reviveError(entry) };
      } else {
        out[m.route.id] = { type: 'data', result: entry.data };
      }
    }
    return out;
  };
}
