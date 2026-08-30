import { renderToReadableStream } from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  isRouteErrorResponse,
  matchRoutes,
  StaticRouterProvider,
  type RouteObject,
} from 'react-router';
import { DocumentContext } from './document.js';
import { buildWebContext, type BuildWebContextDeps } from './context.js';
import { encodeDataResponse, encodeRedirectResponse, routePathnameFromData } from './single-fetch.js';

/**
 * SSR + `.data` handler for the web app (docs/adr/0003). Phase 3 renders the document buffered
 * (`renderToString`); phase 5 swaps in `renderToReadableStream` + turbo-stream deferred data. The
 * `.data` protocol (client single fetch) is phase 4 — `handleData` currently 501s.
 *
 * `routes` is the generated server manifest (`.ratchet/app-routes.server.ts`). The root route
 * renders the full `<html>` (see `routes/root.tsx`), so the SSR render *is* the page.
 */

export interface WebServer {
  handle(request: Request): Promise<Response>;
}

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const SCRIPT_ESCAPE: Record<string, string> = { '&': '\\u0026', '>': '\\u003e', '<': '\\u003c', [LS]: '\\u2028', [PS]: '\\u2029' };
const SCRIPT_ESCAPE_RE = new RegExp(`[&><${LS}${PS}]`, 'g');
function escapeForScript(json: string): string {
  return json.replace(SCRIPT_ESCAPE_RE, (m) => SCRIPT_ESCAPE[m]!);
}

/** Emit `prefix` (the doctype) before the first chunk of the React stream. */
function prependChunk(prefix: Uint8Array): TransformStream<Uint8Array, Uint8Array> {
  let sent = false;
  return new TransformStream({
    transform(chunk, controller) {
      if (!sent) {
        controller.enqueue(prefix);
        sent = true;
      }
      controller.enqueue(chunk);
    },
  });
}

function serializeErrors(errors: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!errors) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(errors)) {
    if (isRouteErrorResponse(value)) out[key] = { ...value, __type: 'RouteErrorResponse' };
    else if (value instanceof Error) out[key] = { message: value.message, __type: 'Error' };
    else out[key] = value;
  }
  return out;
}

export function createWebServer(
  routes: RouteObject[],
  deps: BuildWebContextDeps,
  entrySrc: string,
  resourceRouteIds: ReadonlySet<string> = new Set(),
): WebServer {
  const { query, queryRoute, dataRoutes } = createStaticHandler(routes);

  /** the matched leaf is a resource route (loader/action, no component) — return its raw Response */
  async function tryResourceRoute(request: Request): Promise<Response | null> {
    if (resourceRouteIds.size === 0) return null;
    const matches = matchRoutes(dataRoutes, new URL(request.url).pathname);
    const leaf = matches?.[matches.length - 1]?.route;
    if (!leaf?.id || !resourceRouteIds.has(leaf.id)) return null;
    const requestContext = await buildWebContext(request, deps);
    const result = (await queryRoute(request, { routeId: leaf.id, requestContext })) as unknown;
    return result instanceof Response ? result : Response.json(result ?? null);
  }

  async function handleDocument(request: Request): Promise<Response> {
    const resource = await tryResourceRoute(request);
    if (resource) return resource;

    const requestContext = await buildWebContext(request, deps);
    const result = await query(request, { requestContext });

    // redirects, thrown Responses, and resource-route Responses come back as a Response directly
    if (result instanceof Response) return result;

    const router = createStaticRouter(dataRoutes, result);
    const hydrationData = {
      loaderData: result.loaderData,
      actionData: result.actionData,
      errors: serializeErrors(result.errors),
    };
    const hydrationScript = `window.__staticRouterHydrationData = JSON.parse(${escapeForScript(
      JSON.stringify(JSON.stringify(hydrationData)),
    )});`;

    // Streaming SSR: the shell flushes first, <Suspense> boundaries stream in. `onError` on a
    // post-shell error keeps the connection alive (React swaps in the client fallback on
    // hydration); a shell error rejects the promise and we fall through to a 500.
    let didError = false;
    let stream: ReadableStream<Uint8Array>;
    try {
      stream = await renderToReadableStream(
        <DocumentContext.Provider value={{ hydrationScript, entrySrc }}>
          <StaticRouterProvider router={router} context={result} hydrate={false} />
        </DocumentContext.Provider>,
        {
          onError(error: unknown) {
            didError = true;
            console.error('[web] SSR render error:', error);
          },
        },
      );
    } catch (shellError) {
      console.error('[web] SSR shell error:', shellError);
      return new Response('<!DOCTYPE html><title>Server Error</title><h1>500 — server error</h1>', {
        status: 500,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    const doctype = new TextEncoder().encode('<!DOCTYPE html>');
    const body = stream.pipeThrough(prependChunk(doctype));
    return new Response(body, {
      status: didError ? 500 : result.statusCode,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  async function handleData(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const realUrl = new URL(routePathnameFromData(url.pathname) + url.search, url.origin);
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const realRequest = new Request(realUrl, {
      method: request.method,
      headers: request.headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });

    const requestContext = await buildWebContext(realRequest, deps);
    const result = await query(realRequest, { requestContext });

    if (result instanceof Response) {
      const location = result.headers.get('location');
      if (location && result.status >= 300 && result.status < 400) {
        return encodeRedirectResponse(location, result.status);
      }
      return result;
    }
    return encodeDataResponse(result);
  }

  return {
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname.endsWith('.data')) return handleData(request);
      return handleDocument(request);
    },
  };
}
