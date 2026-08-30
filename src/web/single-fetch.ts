import type { LoaderFunction } from 'react-router';

/**
 * Client-side single fetch (see docs/adr/0003). Every client route whose module has a server
 * `loader`/`action` gets `singleFetchHandler(routeId)` attached in `.ratchet/app-routes.client.ts`
 * — its presence is what tells `createBrowserRouter` to route that route's data through the
 * `dataStrategy` below; the sentinel body itself is never invoked (the strategy resolves every
 * match without calling route handlers).
 *
 * TODO(phase 4/5): `createBrowserRouter`'s `dataStrategy` should batch every to-load match into one
 *   `GET`/`POST <path>.data` request and decode the turbo-stream response. React Router v8 ships
 *   the exact machinery for this as `UNSAFE_getTurboStreamSingleFetchDataStrategy` /
 *   `UNSAFE_decodeViaTurboStream` — wire the client entry to those rather than re-deriving it.
 */

export function singleFetchHandler(routeId: string): LoaderFunction {
  return () => {
    throw new Error(
      `single-fetch sentinel for route '${routeId}' was invoked directly — the client dataStrategy ` +
        `should have intercepted this. This is a bug in @egig/ratchet/web.`,
    );
  };
}

/** `.data` suffix for a given in-app pathname (`/` -> `/_root.data`, RR's convention). */
export function dataPathname(pathname: string): string {
  if (pathname === '/') return '/_root.data';
  return pathname.replace(/\/?$/, '') + '.data';
}
