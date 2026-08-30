import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Meta, Scripts } from './document.js';

/** Injected as the root route's `ErrorBoundary` when `routes/root.tsx` doesn't export its own —
 * renders a full document (the root route owns `<html>`, so its error UI must too). */
export function DefaultRootErrorBoundary() {
  const error = useRouteError();
  const isResponse = isRouteErrorResponse(error);
  const heading = isResponse ? `${error.status} ${error.statusText}` : 'Something went wrong';
  const detail = isResponse
    ? typeof error.data === 'string'
      ? error.data
      : ''
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{heading}</title>
        <Meta />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          font: '16px/1.5 system-ui, sans-serif',
          color: '#1a1a1a',
          background: '#fff',
        }}
      >
        <main style={{ padding: '2rem', maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 .5rem' }}>{heading}</h1>
          {detail ? <p style={{ margin: 0, color: '#555' }}>{detail}</p> : null}
        </main>
        <Scripts />
      </body>
    </html>
  );
}
