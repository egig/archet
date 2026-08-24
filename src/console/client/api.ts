import type { ConsoleModelMeta } from '../serialize-model.js';

// '/' (root mount) needs an empty prefix, not a literal '/', so `${MOUNT_PREFIX}/meta/models`
// doesn't come out as '//meta/models'.
const MOUNT_PREFIX = __CONSOLE_PATH__ === '/' ? '' : __CONSOLE_PATH__;

export interface ApiErrorBody {
  error: { code: string; message?: string; fields?: Record<string, string> };
}

/** Thrown by every helper below on a non-2xx response — carries the same `{ code, fields }`
 * shape `toErrorResponse` (src/router/errors.ts) puts on the wire, so a form can map
 * `err.fields` straight onto its inputs. */
export class ApiRequestError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message ?? body.error.code);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.error.code;
    this.fields = body.error.fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no/invalid JSON body — fall through, handled below per status
  }

  if (!res.ok) {
    const errorBody = (body as Partial<ApiErrorBody> | null)?.error
      ? (body as ApiErrorBody)
      : { error: { code: res.status === 401 ? 'UNAUTHENTICATED' : 'UNKNOWN_ERROR' } };
    throw new ApiRequestError(res.status, errorBody);
  }

  return (body as { data: T }).data;
}

export interface AuthUser {
  id: string;
  email: string;
  roleId: string | null;
  active: boolean;
  permissions: { resource: string; action: string }[];
}

export function setupStatus(): Promise<{ required: boolean }> {
  return request('/api/auth/setup');
}

export function setup(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  return request('/api/auth/setup', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<null> {
  return request('/api/auth/logout', { method: 'POST' });
}

export function me(): Promise<AuthUser> {
  return request('/api/auth/me');
}

export function listModels(): Promise<ConsoleModelMeta[]> {
  return request(`${MOUNT_PREFIX}/meta/models`);
}

export interface OffsetPage {
  mode: 'offset';
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export async function listRows(
  model: string,
  opts: { limit: number; offset: number; include?: string[] },
): Promise<OffsetPage> {
  const params = new URLSearchParams({ limit: String(opts.limit), offset: String(opts.offset) });
  if (opts.include?.length) params.set('include', opts.include.join(','));
  const res = await fetch(`/api/${encodeURIComponent(model)}?${params.toString()}`, {
    headers: { 'content-type': 'application/json' },
  });
  const body = (await res.json()) as { data: Record<string, unknown>[]; meta: Omit<OffsetPage, 'mode' | 'rows'> };
  if (!res.ok) {
    const errBody = body as unknown as ApiErrorBody;
    throw new ApiRequestError(res.status, errBody);
  }
  return { mode: 'offset', rows: body.data, ...body.meta };
}

export function getRow(model: string, id: string): Promise<Record<string, unknown>> {
  return request(`/api/${encodeURIComponent(model)}/${encodeURIComponent(id)}`);
}

export function createRow(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return request(`/api/${encodeURIComponent(model)}`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateRow(model: string, id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return request(`/api/${encodeURIComponent(model)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function removeRow(model: string, id: string): Promise<Record<string, unknown>> {
  return request(`/api/${encodeURIComponent(model)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function hasPermission(permissions: AuthUser['permissions'], resource: string, action: string): boolean {
  return permissions.some((p) => (p.resource === resource || p.resource === '*') && (p.action === action || p.action === '*'));
}
