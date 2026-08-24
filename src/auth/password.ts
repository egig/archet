const PBKDF2_ITERATIONS = 600_000; // OWASP-current guidance for PBKDF2-SHA256
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(derived);
}

/** Constant-time compare — Web Crypto has no `timingSafeEqual` equivalent. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Encodes as `pbkdf2:<iterations>:<saltHex>:<hashHex>` so the iteration count can be raised later
 * without breaking verification of hashes created under a lower count. Built entirely on Web Crypto
 * (`crypto.subtle`) rather than `node:crypto`'s scrypt so hashing behaves identically on Node, Cloudflare
 * Workers, Vercel Edge, Deno, and Bun — none of which expose scrypt through a standard API. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveKey(plain, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(derived)}`;
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const [, iterationsRaw, saltHex, hashHex] = parts as [string, string, string, string];
  const iterations = Number.parseInt(iterationsRaw, 10);
  const salt = fromHex(saltHex);
  const expected = fromHex(hashHex);
  const derived = await deriveKey(plain, salt, iterations);
  return timingSafeEqual(derived, expected);
}
