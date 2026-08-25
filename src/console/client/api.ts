import type { ConsoleModelMeta } from '../serialize-model.js';
import type { ConsoleDomainMeta } from '../serialize-domain.js';
import type { FilterNode } from './FilterBar.js';

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

export function listDomains(): Promise<ConsoleDomainMeta[]> {
  return request(`${MOUNT_PREFIX}/meta/domains`);
}

export function getDomainSettings(domain: string): Promise<Record<string, unknown>> {
  return request(`${MOUNT_PREFIX}/meta/domains/${encodeURIComponent(domain)}/settings`);
}

export function updateDomainSettings(domain: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return request(`${MOUNT_PREFIX}/meta/domains/${encodeURIComponent(domain)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
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
  opts: {
    limit: number;
    offset: number;
    include?: string[];
    /** the same shape `router/query.ts`'s `FilterNode[]` parses, sent as `?filter=<json>` (Q:
     * WorkspaceView's saved `filters` round-trip straight through here). */
    filters?: FilterNode[];
    /** `-field` for descending, matching `router/query.ts`'s convention. */
    sort?: string;
  },
): Promise<OffsetPage> {
  const params = new URLSearchParams({ limit: String(opts.limit), offset: String(opts.offset) });
  if (opts.include?.length) params.set('include', opts.include.join(','));
  if (opts.filters?.length) params.set('filter', JSON.stringify(opts.filters));
  if (opts.sort) params.set('sort', opts.sort);
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

/** `POST /api/:model/:id/lock` and `/unlock` — only defined for models that declare a `lock`/
 * `unlock` operation (currently just `Workspace`); calling either on any other model 404s. */
export function lockRow(model: string, id: string): Promise<Record<string, unknown>> {
  return request(`/api/${encodeURIComponent(model)}/${encodeURIComponent(id)}/lock`, { method: 'POST' });
}

export function unlockRow(model: string, id: string): Promise<Record<string, unknown>> {
  return request(`/api/${encodeURIComponent(model)}/${encodeURIComponent(id)}/unlock`, { method: 'POST' });
}

export interface UploadedFile {
  key: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** `POST /api/:model/:field/upload` (Q3's two-step upload) — the caller sends the returned
 * `UploadedFile` as the field's own create/update value. Bypasses `request()`: a multipart body
 * must not carry a manually-set `content-type` (the browser sets the boundary itself). */
export async function uploadFile(model: string, field: string, file: File): Promise<UploadedFile> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/${encodeURIComponent(model)}/${encodeURIComponent(field)}/upload`, { method: 'POST', body });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no/invalid JSON body — fall through, handled below per status
  }
  if (!res.ok) {
    const errorBody = (json as Partial<ApiErrorBody> | null)?.error ? (json as ApiErrorBody) : { error: { code: 'UNKNOWN_ERROR' } };
    throw new ApiRequestError(res.status, errorBody);
  }
  return (json as { data: UploadedFile }).data;
}

export function hasPermission(permissions: AuthUser['permissions'], resource: string, action: string): boolean {
  return permissions.some((p) => (p.resource === resource || p.resource === '*') && (p.action === action || p.action === '*'));
}

export interface ChatSummary {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRow {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'tool' | 'context';
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function listChats(): Promise<ChatSummary[]> {
  return request('/api/automation/chats');
}

export function listChatMessages(chatId: string): Promise<ChatMessageRow[]> {
  return request(`/api/automation/chats/${encodeURIComponent(chatId)}/messages`);
}

export interface ChatTurnHandlers {
  onTextDelta: (text: string) => void;
  onThinkingDelta: (text: string) => void;
  onDone: (info: { chatId: string; messageId: string; stopReason: string }) => void;
  onError: (message: string) => void;
}

/** POST-and-stream — `EventSource` can't send a request body, so this reads the response's SSE
 * body by hand: split on blank-line frame boundaries, parse `event:`/`data:` lines, dispatch. */
async function streamChatTurn(path: string, body: Record<string, unknown>, handlers: ChatTurnHandlers): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    let message = `request failed (${res.status})`;
    try {
      const errBody = (await res.json()) as ApiErrorBody;
      message = errBody.error.message ?? errBody.error.code;
    } catch {
      // no JSON body — keep the generic message
    }
    handlers.onError(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;

      if (event === 'delta') {
        if (data.kind === 'thinking') handlers.onThinkingDelta(data.text as string);
        else handlers.onTextDelta(data.text as string);
      } else if (event === 'done') {
        handlers.onDone({ chatId: data.chatId as string, messageId: data.messageId as string, stopReason: data.stopReason as string });
      } else if (event === 'error') {
        handlers.onError(data.message as string);
      }
    }
  }
}

/** Creates a chat, persists the first message, and streams the reply — `onDone`'s `chatId`
 * (set server-side before streaming starts, see src/automation/router.ts) is what the caller
 * navigates to. `workspaceId`, when given, has the server insert a `role: 'context'` snapshot of
 * that workspace's tabs before this message (src/automation/router.ts's `insertWorkspaceContext`). */
export function createChatAndSend(
  agentId: string,
  message: string,
  handlers: ChatTurnHandlers,
  workspaceId?: string,
): Promise<void> {
  return streamChatTurn('/api/automation/chats', { agentId, message, workspaceId }, handlers);
}

export function sendChatMessage(
  chatId: string,
  message: string,
  handlers: ChatTurnHandlers,
  workspaceId?: string,
): Promise<void> {
  return streamChatTurn(`/api/automation/chats/${encodeURIComponent(chatId)}/messages`, { message, workspaceId }, handlers);
}
