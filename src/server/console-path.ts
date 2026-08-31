/**
 * Shared `consolePath` validation — used both by `cli/load-config.ts` (resolving
 * `ratchet.config.ts`) and by `createRatchetApp` (which catches a hand-written entry file, e.g. a
 * Cloudflare Worker, hardcoding a bad `CONSOLE_PATH`).
 *
 * Rejects anything that can't be an unambiguous `App.route()` mount prefix (router/http-app.ts),
 * or that would shadow (or be shadowed by) the framework's own `/api` and `/api/auth` routers.
 */
export function assertValidConsolePath(consolePath: string): void {
  if (!consolePath.startsWith('/')) {
    throw new Error(`consolePath must start with '/', got '${consolePath}'`);
  }
  if (consolePath !== '/' && consolePath.endsWith('/')) {
    throw new Error(`consolePath must not have a trailing slash, got '${consolePath}'`);
  }
  if (consolePath === '/api' || consolePath === '/api/auth' || consolePath.startsWith('/api/')) {
    throw new Error(`consolePath '${consolePath}' collides with the framework's '/api'/'/api/auth' routers`);
  }
}
