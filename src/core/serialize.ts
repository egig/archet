import type { ModelDefinition } from './model.js';

const AUTO_TIMESTAMP_KEYS = ['createdAt', 'updatedAt', 'deletedAt'];

function toIso(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return value;
}

/**
 * Raw `db.execute(sql...)` rows come back with whatever text/Date representation the driver
 * chose for timestamptz (postgres.js returns Postgres's native `2024-01-01 00:00:00+00` text
 * here, not ISO 8601, since this bypasses Drizzle's typed column mapping — see persistence.ts).
 * Every response — create/update/remove via `persist`, and list/get via the router — normalizes
 * through this so API responses are always ISO 8601, never a driver-specific format.
 */
export function normalizeTimestamps(model: ModelDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const key of AUTO_TIMESTAMP_KEYS) {
    if (key in out) out[key] = toIso(out[key]);
  }
  for (const [key, f] of Object.entries(model.fields)) {
    if (f.kind === 'datetime' && key in out) out[key] = toIso(out[key]);
  }
  return out;
}

/** Strips every `field.*({ sensitive: true })` column (e.g. a password hash) from a row before
 * it can reach an HTTP response — applied at every router response boundary, never in persistence. */
export function redactSensitiveFields(model: ModelDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const [key, f] of Object.entries(model.fields)) {
    if (f.sensitive) delete out[key];
  }
  return out;
}

/** A `file` field's column stores `{ key, filename, mimeType, size }` (`StoredFile`, see
 * `core/storage.ts`) — `key` addresses the blob in the storage adapter and must never reach a
 * client (Q12): it would let a caller bypass the gated read route entirely if the adapter or
 * bucket isn't itself locked down. Every row that crosses into an HTTP response is rewritten
 * here, replacing `key` with a `url` pointing at the gated per-field read route
 * (`GET /api/:model/:id/:field`, `router/create-router.ts`) — applied alongside
 * `redactSensitiveFields` at every response boundary. `row.id` must already be set (auto-assigned
 * on insert, always present by the time a row is serialized). */
export function deriveFileFields(model: ModelDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const [key, f] of Object.entries(model.fields)) {
    if (f.kind !== 'file') continue;
    const value = out[key];
    if (value === null || value === undefined || typeof value !== 'object') continue;
    const { filename, mimeType, size } = value as { filename: unknown; mimeType: unknown; size: unknown };
    out[key] = { url: `/api/${model.name}/${String(out.id)}/${key}`, filename, mimeType, size };
  }
  return out;
}
