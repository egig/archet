export const SESSION_COOKIE_NAME = 'ratchet_session';

function readCookie(request: Request | undefined, name: string): string | null {
  const header = request?.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

/** `Authorization: Bearer <token>` first (an explicit header wins if a caller somehow sends
 * both), falling back to the `ratchet_session` cookie — shared by the pipeline's `requireAuth`
 * and every plain route handler in `src/auth/router.ts` so both paths accept either transport. */
export function resolveSessionToken(request: Request | undefined): string | null {
  const header = request?.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }
  return readCookie(request, SESSION_COOKIE_NAME);
}
