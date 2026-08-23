import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function sessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}
