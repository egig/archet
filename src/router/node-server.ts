/**
 * Replacement for `@hono/node-server`'s `serve()` — bridges an `App` (router/http-app.ts, built on
 * the Fetch API's `Request`/`Response`) onto Node's `http` module. Only used by `ratchet build`'s
 * generated `dist/server.js` (cli/build-console.ts's `buildServerBundle`): `ratchet serve`/`ratchet
 * dev` run under Bun and use `Bun.serve` directly, but the built bundle deliberately still targets
 * plain Node so a VPS/container deploy doesn't need Bun installed — see CHANGELOG.md.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

function toFetchRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? 'localhost';
  const url = `http://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    // Node's `Request` needs `duplex: 'half'` for a streamed body — there's no public type for
    // this option yet, hence the cast.
    ...(hasBody ? { body: Readable.toWeb(req) as unknown as ReadableStream, duplex: 'half' as const } : {}),
  } as RequestInit);
}

async function writeFetchResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  const setCookies = response.headers.getSetCookie?.() ?? [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return; // written separately below, one header per cookie
    res.setHeader(key, value);
  });
  if (setCookies.length > 0) res.setHeader('set-cookie', setCookies);

  if (!response.body) {
    res.end();
    return;
  }
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    res.write(chunk);
  }
  res.end();
}

export interface ServeNodeOptions {
  port: number;
}

/** Boots a plain Node `http` server dispatching every request through `app.fetch` — the Node
 * counterpart to `Bun.serve({ fetch: app.fetch })`. */
export function serveNode(app: { fetch(request: Request): Response | Promise<Response> }, options: ServeNodeOptions) {
  const server = createServer((req, res) => {
    void (async () => {
      const response = await app.fetch(toFetchRequest(req));
      await writeFetchResponse(response, res);
    })().catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.listen(options.port);
  return server;
}
