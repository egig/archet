import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { PipelineError } from '../core/pipeline.js';
import { fetchRow, insertRow, updateRow } from '../core/persistence.js';
import { listRows } from '../router/list.js';
import { toErrorResponse } from '../router/errors.js';
import { readJsonBody } from '../router/create-router.js';
import { resolveSessionUser } from '../auth/pipeline.js';
import type { UserRow } from '../auth/lookup.js';
import { Agent, Chat, Message } from './models/index.js';
import { assertOwnsChat } from './pipeline.js';
import { runAgentTurn } from './run-turn.js';
import type { ChatMessage } from './provider.js';

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

function requireMessageText(input: Record<string, unknown>): string {
  const message = input.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new PipelineError({ code: 'VALIDATION_ERROR', status: 400, fields: { message: 'required' } });
  }
  return message;
}

async function loadHistory(db: AnyDb, chatId: string): Promise<ChatMessage[]> {
  const page = await listRows(db, Message, {}, {
    limit: 200,
    offset: 0,
    sortField: 'createdAt',
    sortDirection: 'asc',
    includeDeleted: false,
    include: [],
    filters: [{ field: 'chatId', op: '=', value: chatId }],
  });
  // MVP only ever persists 'user'/'assistant' rows (see Message model comment) — a 'tool' row
  // never lands here, so this cast is safe.
  return page.rows.map((row) => ({ role: row.role as 'user' | 'assistant', content: row.content as string }));
}

/** Streams one agent turn over SSE: persists the user's message, runs `runAgentTurn` against
 * the full history, forwards every delta/tool-call as it happens, then persists the assistant's
 * final message and bumps `chat.updatedAt` so the console sidebar sorts by recent activity. */
function streamTurn(c: Context, db: AnyDb, user: UserRow, chat: Record<string, unknown>, agent: Record<string, unknown>, userMessage: string) {
  return streamSSE(c, async (stream) => {
    await insertRow(db, Message, { chatId: chat.id, role: 'user', content: userMessage });
    const history = await loadHistory(db, chat.id as string);

    let assistantText = '';
    let finalStopReason = 'end_turn';
    let finalUsage = { inputTokens: 0, outputTokens: 0 };

    try {
      for await (const event of runAgentTurn({ agent, history, db, user })) {
        if (event.type === 'text-delta') {
          assistantText += event.text;
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ kind: 'text', text: event.text }) });
        } else if (event.type === 'thinking-delta') {
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ kind: 'thinking', text: event.text }) });
        } else if (event.type === 'tool-call') {
          await stream.writeSSE({ event: 'tool', data: JSON.stringify(event.call) });
        } else {
          finalStopReason = event.stopReason;
          finalUsage = event.usage;
        }
      }
    } catch (err) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: err instanceof Error ? err.message : 'agent turn failed' }) });
      return;
    }

    const assistantMessage = await insertRow(db, Message, {
      chatId: chat.id,
      role: 'assistant',
      content: assistantText,
      metadata: { stopReason: finalStopReason, usage: finalUsage, model: agent.model, provider: agent.provider },
    });
    await updateRow(db, Chat, chat.id as string, {});

    await stream.writeSSE({
      event: 'done',
      data: JSON.stringify({ chatId: chat.id, messageId: assistantMessage.id, stopReason: finalStopReason, usage: finalUsage }),
    });
  });
}

export function createAutomationRouter(db: AnyDb): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as never);
  });

  // mounted at `/api/chats` (src/cli/commands/serve.ts) — routes here are relative to that,
  // so '/' is `/api/chats` itself and '/:id/messages' is `/api/chats/:id/messages`.
  app.get('/', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    const page = await listRows(db, Chat, {}, {
      limit: 100,
      offset: 0,
      sortField: 'updatedAt',
      sortDirection: 'desc',
      includeDeleted: false,
      include: [],
      filters: [{ field: 'userId', op: '=', value: user.id }],
    });
    return c.json({ data: page.rows });
  });

  app.get('/:id/messages', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    await requireOwnedChat(db, c.req.param('id'), user);
    const history = await listRows(db, Message, {}, {
      limit: 200,
      offset: 0,
      sortField: 'createdAt',
      sortDirection: 'asc',
      includeDeleted: false,
      include: [],
      filters: [{ field: 'chatId', op: '=', value: c.req.param('id') }],
    });
    return c.json({ data: history.rows });
  });

  // creates the chat, persists the first message, and streams the reply — one call covers the
  // "type a message with no chat open yet" flow the console's empty state needs.
  app.post('/', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    const input = await readJsonBody(c);
    const agent = await loadActiveAgent(db, input.agentId);
    const message = requireMessageText(input);

    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : message.slice(0, 60);
    const chat = await insertRow(db, Chat, { userId: user.id, agentId: agent.id, title, status: 'active' });

    return streamTurn(c, db, user, chat, agent, message);
  });

  app.post('/:id/messages', async (c) => {
    const user = await resolveSessionUser(db, c.req.raw);
    const chat = await requireOwnedChat(db, c.req.param('id'), user);
    const input = await readJsonBody(c);
    const message = requireMessageText(input);
    const agent = await loadActiveAgent(db, chat.agentId);

    return streamTurn(c, db, user, chat, agent, message);
  });

  return app;
}
