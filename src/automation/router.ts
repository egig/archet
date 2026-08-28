import { Hono } from 'hono';
import { createAssistantStreamResponse } from 'assistant-stream';
import type { ReadonlyJSONObject } from 'assistant-stream/utils';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { ModelDefinition } from '../core/model.js';
import { PipelineError } from '../core/pipeline.js';
import { fetchRow, insertRow, updateRow, hardRemoveRow } from '../core/persistence.js';
import { listRows } from '../router/list.js';
import { toErrorResponse } from '../router/errors.js';
import { readJsonBody } from '../router/create-router.js';
import { resolveSessionUser } from '../auth/pipeline.js';
import type { UserRow } from '../auth/lookup.js';
import { Agent, Chat, Message } from './models/index.js';
import { assertOwnsChat } from './pipeline.js';
import { runAgentTurn } from './run-turn.js';
import type { ChatMessage } from './provider.js';
import {
  AssistantPartsBuilder,
  storedToProviderMessages,
  type StoredMessage,
  type StoredPart,
} from './message-parts.js';
import { Workspace, WorkspaceView } from '../workspace/models/index.js';
import { assertOwnsWorkspace } from '../workspace/pipeline.js';

type AnyDb = PgDatabase<any, any, any>;

async function loadActiveAgent(db: AnyDb, agentId: unknown): Promise<Record<string, unknown>> {
  if (typeof agentId !== 'string' || !agentId) {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { agentId: 'required' } });
  }
  const agent = await fetchRow(db, Agent, agentId);
  if (!agent || agent.active !== true) {
    throw new PipelineError({ code: 'NOT_FOUND', status: 404, message: 'agent not found or inactive' });
  }
  return agent;
}

async function requireOwnedChat(db: AnyDb, chatId: string, user: UserRow): Promise<Record<string, unknown>> {
  const chat = await fetchRow(db, Chat, chatId);
  assertOwnsChat(chat, user);
  return chat;
}

/** Rows persisted for a chat, oldest first, as `StoredMessage`s. Only `user`/`assistant` rows
 * are ever written (see `message-parts.ts`), but the cast is tolerant of a stray `tool` row. */
async function loadStoredMessages(db: AnyDb, chatId: string): Promise<StoredMessage[]> {
  const page = await listRows(db, Message, {}, {
    limit: 500,
    offset: 0,
    sort: [{ field: 'createdAt', direction: 'asc' }],
    cursorMode: false,
    includeDeleted: false,
    include: [],
    filters: [{ field: 'chatId', op: '=', value: chatId }],
  });
  return page.rows.map((row) => ({
    role: row.role as StoredMessage['role'],
    content: Array.isArray(row.content) ? (row.content as StoredPart[]) : [],
  }));
}

/**
 * A workspace + its view tabs, as a `ChatMessage` prepended to the model's context for one turn
 * only — never persisted (Q5). The console passes `workspaceId` in the request body; this checks
 * the requester owns it (same `assertOwnsWorkspace` the generic router uses) before reading it.
 */
async function workspaceContextMessage(
  db: AnyDb,
  registry: Record<string, ModelDefinition>,
  workspaceId: string,
  user: UserRow,
): Promise<ChatMessage> {
  const workspace = await fetchRow(db, Workspace, workspaceId);
  assertOwnsWorkspace(workspace, user);

  const views = await listRows(db, WorkspaceView, registry, {
    limit: 100,
    offset: 0,
    sort: [{ field: 'order', direction: 'asc' }],
    cursorMode: false,
    includeDeleted: false,
    include: [],
    filters: [{ field: 'workspaceId', op: '=', value: workspaceId }],
  });

  const snapshot = {
    workspace: { id: workspace.id, name: workspace.name },
    views: views.rows.map((v) => ({
      id: v.id,
      label: v.label,
      targetModel: v.targetModel,
      filters: v.filters,
      sort: v.sort,
      include: v.include,
      limit: v.limit,
      order: v.order,
    })),
  };

  return {
    role: 'user',
    content:
      'Current workspace context (the tabs the user is looking at right now). ' +
      'Use your workspace-view tools to open, edit, or close tabs.\n' +
      JSON.stringify(snapshot),
  };
}

/** The most recent user turn's text out of the `messages` array assistant-ui's data-stream
 * runtime POSTs. History itself is rebuilt from the DB — this is the only thing the endpoint
 * trusts from the request body (Q17). */
function latestUserText(body: Record<string, unknown>): string {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m?.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .filter((p): p is { type: string; text: string } => !!p && (p as { type?: string }).type === 'text')
        .map((p) => p.text)
        .join('');
    }
  }
  return '';
}

function toHistoryRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    role: row.role as string,
    content: row.content as StoredPart[],
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt as string,
  };
}

export function createAutomationRouter(db: AnyDb, registry: Record<string, ModelDefinition>): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as never);
  });

  // ── Thread list (assistant-ui RemoteThreadListAdapter) ──────────────────────────────────────
  // mounted at `/api/automation` (src/cli/commands/serve.ts).

  app.get('/chats', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    const page = await listRows(db, Chat, {}, {
      limit: 200,
      offset: 0,
      sort: [{ field: 'updatedAt', direction: 'desc' }],
      cursorMode: false,
      includeDeleted: false,
      include: [],
      filters: [{ field: 'userId', op: '=', value: user.id }],
    });
    return c.json({
      data: page.rows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        title: row.title,
        status: row.status,
        updatedAt: row.updatedAt,
      })),
    });
  });

  // `initialize(threadId)` — creates the Chat record. `agentId` is chosen in the console's
  // "new chat" affordance before this fires (Q4).
  app.post('/chats', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    const input = await readJsonBody(c);
    const agent = await loadActiveAgent(db, input.agentId);
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 255) : null;
    const chat = await insertRow(db, Chat, { userId: user.id, agentId: agent.id, title, status: 'active' }, user.id);
    return c.json({ data: { id: chat.id } });
  });

  // `rename` / `archive` / `unarchive`.
  app.patch('/chats/:id', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    await requireOwnedChat(db, c.req.param('id'), user);
    const input = await readJsonBody(c);
    const patch: Record<string, unknown> = {};
    if (typeof input.title === 'string') patch.title = input.title.trim().slice(0, 255);
    if (input.status === 'active' || input.status === 'archived') patch.status = input.status;
    const updated = await updateRow(db, Chat, c.req.param('id'), patch);
    return c.json({ data: updated });
  });

  app.delete('/chats/:id', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    await requireOwnedChat(db, c.req.param('id'), user);
    const messages = await listRows(db, Message, {}, {
      limit: 1000,
      offset: 0,
      sort: [{ field: 'createdAt', direction: 'asc' }],
      cursorMode: false,
      includeDeleted: false,
      include: [],
      filters: [{ field: 'chatId', op: '=', value: c.req.param('id') }],
    });
    for (const m of messages.rows) await hardRemoveRow(db, Message, m.id as string);
    await hardRemoveRow(db, Chat, c.req.param('id'));
    return c.json({ data: { id: c.req.param('id') } });
  });

  // history `load()` — flat, oldest-first. The console maps these rows to a linear
  // `ExportedMessageRepository` (no branching, Q14).
  app.get('/chats/:id/messages', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    await requireOwnedChat(db, c.req.param('id'), user);
    const history = await listRows(db, Message, {}, {
      limit: 1000,
      offset: 0,
      sort: [{ field: 'createdAt', direction: 'asc' }],
      cursorMode: false,
      includeDeleted: false,
      include: [],
      filters: [{ field: 'chatId', op: '=', value: c.req.param('id') }],
    });
    return c.json({ data: history.rows.map(toHistoryRow) });
  });

  // ── One streamed turn (assistant-ui data-stream protocol) ───────────────────────────────────
  //
  // `useDataStreamRuntime` POSTs to this one fixed URL with `{ threadId, messages, system,
  // tools, workspaceId? }`. Security boundary (Q17): `system` and `tools` from the body are
  // ignored outright (the agent's system prompt and role-derived tools are
  // authoritative); `messages` is read only for the latest user turn's text — the rest of the
  // history is rebuilt from the DB.
  app.post('/chat', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    const input = await readJsonBody(c);
    const chatId = typeof input.threadId === 'string' ? input.threadId : '';
    if (!chatId) throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { threadId: 'required' } });

    const chat = await requireOwnedChat(db, chatId, user);
    const agent = await loadActiveAgent(db, chat.agentId);

    const userText = latestUserText(input);
    if (!userText.trim()) {
      throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { message: 'required' } });
    }

    const workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId : undefined;
    const contextMessage = workspaceId
      ? await workspaceContextMessage(db, registry, workspaceId, user)
      : undefined;

    // persist the user turn now, before streaming (server-authoritative, Q13).
    await insertRow(
      db,
      Message,
      { chatId, role: 'user', content: [{ type: 'text', text: userText }] satisfies StoredPart[] },
      user.id,
    );

    // first message doubles as the chat title until renamed (Q15) — `initialize` created the
    // chat with none since it only knew a local id.
    if (!chat.title) {
      await updateRow(db, Chat, chatId, { title: userText.trim().slice(0, 80) });
    }

    const stored = await loadStoredMessages(db, chatId);
    const history: ChatMessage[] = [
      ...(contextMessage ? [contextMessage] : []),
      ...storedToProviderMessages(stored),
    ];

    const abortSignal = c.req.raw.signal;

    return createAssistantStreamResponse(async (controller) => {
      const parts = new AssistantPartsBuilder();
      let stopReason = 'end_turn';
      let usage = { inputTokens: 0, outputTokens: 0 };

      try {
        for await (const event of runAgentTurn({ agent, history, db, request: c.req.raw, registry, abortSignal })) {
          if (event.type === 'text-delta') {
            parts.appendText(event.text);
            controller.appendText(event.text);
          } else if (event.type === 'thinking-delta') {
            parts.appendReasoning(event.text);
            controller.appendReasoning(event.text);
          } else if (event.type === 'tool-call') {
            parts.addToolCall(event.call);
            controller.addToolCallPart({
              toolCallId: event.call.id,
              toolName: event.call.name,
              args: (event.call.input ?? {}) as ReadonlyJSONObject,
            });
          } else if (event.type === 'tool-result') {
            parts.setToolResult(event.result.toolCallId, event.result.content, event.result.isError);
          } else {
            stopReason = event.stopReason;
            usage = event.usage;
          }
        }
      } catch (err) {
        controller.appendText(`\n\n_Agent turn failed: ${err instanceof Error ? err.message : 'unknown error'}_`);
        stopReason = 'error';
      }

      if (!parts.isEmpty()) {
        await insertRow(
          db,
          Message,
          {
            chatId,
            role: 'assistant',
            content: parts.build(),
            metadata: { stopReason, usage, model: agent.model },
          },
          user.id,
        );
      }
      await updateRow(db, Chat, chatId, {});
    });
  });

  return app;
}
