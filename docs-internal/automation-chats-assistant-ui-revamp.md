# Automation → Chats: re-architecture on assistant-ui

Status: planned (grilled 2026-08-28). Single branch/PR. Breaking — **clears existing chat history**.

## Goal

Re-architect the Automation → Chats feature around assistant-ui's runtime and
data-stream protocol: `useDataStreamRuntime` on the client, the `assistant-stream`
package on the server, `RemoteThreadListRuntime` for thread management, vendored
(not packaged) assistant-ui components restyled to the console.

## Decisions

| # | Decision |
|---|----------|
| 1 | Full re-architecture (messages + streaming protocol + thread management), not a presentational swap. |
| 2 | Server adopts `assistant-stream` (`createAssistantStreamResponse`). Hand-rolled SSE (`delta`/`tool`/`done`/`error`) and `api.ts`'s `streamChatTurn` parser are deleted. `@assistant-ui/react` + `assistant-stream` become deps. |
| 3 | `Message` content becomes parts-based, stored as a **JSON blob** (`content` `text` → `jsonb`), holding the assistant-ui message payload verbatim. No normalized parts table. `metadata` stays for `{ usage, stopReason, model }`. |
| 4 | Routes restructured to match assistant-ui's thread lifecycle: `POST /chats` creates a bare `Chat` (needs `agentId`, no message, no stream); `GET /chats` = `list()`; `PATCH /chats/:id` = rename/archive/unarchive; `DELETE /chats/:id` = delete; `GET /chats/:id/messages` = history `load()`; `POST /chats/:id/messages` = append user msg + stream reply. No more implicit chat creation on first message. Agent chosen before `initialize()` via a "new chat" affordance whose selection the `RemoteThreadListAdapter.initialize` closure reads; `agentId` stays required on `Chat`. |
| 5 | Workspace snapshot goes through assistant-ui **`ModelContext`, not persisted**. Client passes `workspaceId` in the request `body`; server fetches workspace + views and prepends to that one model call. `'context'` role removed from `Message` enum; `ChatThreadView`'s snapshot `<details>` deleted. **Audit trail ("workspace at turn 7") is dropped — accepted.** |
| 6 | `onTurnDone` → `WorkspaceTabs` refresh re-wired through the data-stream runtime's `onFinish` callback (blunt refetch + workspace-views query invalidation, same behavior as today). No custom "which tabs changed" data part. |
| 7 | Chat surfaced in **both** places, sharing one runtime/adapter set: a new standalone `/automation/chats` route (full two-pane layout, thread-list rail + thread) **and** the workspace right-panel embed. |
| 8 | Tool calls **auto-execute** as today; render tool activity clearly (operation + args + result). Approval gates / human-in-the-loop (writes-only or per-agent config) noted as **fast follow, not this PR**. |
| 9 | **Vendor** assistant-ui's primitives-based components into `src/console/client/chat/`, restyled to the console's light-gray palette. Depend on `@assistant-ui/react` (primitives), not `@assistant-ui/react-ui` (styled). |
| 10 | **Markdown, no syntax highlighting** — `@assistant-ui/react-markdown` + `remark-gfm`. Code blocks render as plain `<pre>`. Highlighter deferred. |
| 11 | New deps go in `@egig/ratchet` `dependencies` (like `@tanstack/react-query`, `react-router`). zod v3 (ratchet) and zod v4 (assistant-ui, nested install) coexist — assistant-ui's zod never crosses into ratchet's model/validation code. Bundle growth (~+200KB gz, ballpark) accepted for an authed admin console; code-splitting the chat route deferred. **Repo-wide zod 4 migration noted as later work.** |
| 12 | Migration is **breaking with no data conversion** — drop/recreate (or truncate) `messages`. Changelog: "clears chat history". |
| 13 | **Server-authoritative persistence.** `POST /chats/:id/messages` writes the user row, streams, writes the assistant row at stream end (JSON parts + `metadata`). Client implements only `ThreadHistoryAdapter.load()`; no `append()`. UI refreshes via `load()` after turn (as today). |
| 14 | **No branching.** `parentId` dropped entirely — `Message` stays a flat ordered list per chat. Vendored `thread.tsx` drops edit / regenerate / branch-picker affordances. |
| 15 | Titles: **first-message slice + manual rename** (`PATCH /chats/:id` powers `rename()`). Auto-title generation noted as fast follow. |
| 16 | **Stop button honored.** `runAgentTurn` checks `c.req.raw.signal` between tool iterations and on provider chunks, stops cleanly, **persists the partial assistant message** with `metadata.stopReason = 'aborted'`. Completed tool ops are not rolled back. |
| 17 | Request contract is a **security boundary**: server **ignores** client-sent `system` and `tools` entirely (agent's system prompt from `Agent.systemPrompt`, tools from `AgentPermission` via `run-turn.ts`); server rebuilds history from `loadHistory(chatId)` and reads only the latest user message text + `workspaceId` from the payload. Documented in `router.ts`. |
| 18 | Assistant metadata: **hidden by default**, minimal muted footer on assistant messages (model id; token usage on hover/expand). `stopReason` `aborted`/`refusal`/`max_tokens` shown as a small inline notice. |
| 19 | Workspace panel = **active thread + compact switcher only** (dropdown like today's "History" + "New"). No `ThreadList` rail in the panel. `workspaceId` always flows into `ModelContext`. Standalone route is where thread management happens. Per-workspace `chatEnabled` and per-browser `chatOpen` toggle unchanged. |
| 20 | Fix provider resolution in this work: add **`kind: field.enum(['anthropic','openai'])` to the `Provider` model**; `run-turn.ts` resolves the adapter from `providerRow.kind` instead of the nonexistent `agent.provider`. Folded into the same migration. |
| 21 | Access control: **open to any authenticated user**, rows scoped to `userId` (as today). Agent-level access control is a separate design conversation. |
| 22 | Tests: **backend route-contract tests + a serialization unit test** for `Message`-row ↔ `ThreadMessage` (both directions). No React component tests (not the house style). |
| 23 | **Single branch/PR.** No compat shims — there's no production data to protect. |

## Working assumptions (settled)

- Non-resumable streams — `assistant-stream` core needs no redis. Client navigating
  away mid-turn still gets a persisted result (server finishes regardless). Hard
  connection drop loses that turn's stream, row still lands.
- Standalone route sits inside `<Layout>` (sidebar visible), via a new
  `AutomationDomain` `consoleMenu` entry `{ to: 'automation/chats', label: 'Chats' }`.
  Registered in `ConsoleApp.tsx` ahead of the `:model/*` catch-all.
- `runAgentTurn`'s existing `thinking-delta` → `assistant-stream` reasoning parts →
  assistant-ui native reasoning rendering.
- Vendored components in `src/console/client/chat/`; Tailwind `@source "."` covers them.
- `@assistant-ui/react-data-stream` (`0.12.x`) provides `useDataStreamRuntime`,
  composed under `useRemoteThreadListRuntime({ runtimeHook })`.
- Client sends a minimal body (`{ workspaceId? }` + assistant-ui hard requirements).

## Affected files

**Backend**
- `src/automation/models/message.model.ts` — `content` `text`→`json`; drop `'context'` from role enum; `metadata` kept.
- `src/automation/models/provider.model.ts` — add `kind` enum field.
- `src/automation/models/chat.model.ts` — minor (title handling); still `api: { hidden: true }`.
- `src/automation/router.ts` — full rewrite: new route shape, `createAssistantStreamResponse`, request-contract security boundary, `workspaceId` → ModelContext prepend, abort handling.
- `src/automation/run-turn.ts` — provider resolution from `providerRow.kind`; `abortSignal` checks; emit reasoning/tool parts into the stream controller.
- `src/automation/domain.ts` — add `consoleMenu`.
- migration (consumer `example/migrations/` via `ratchet generate`) — drop/recreate `messages`, add `providers.kind`.

**Frontend**
- Delete: `src/console/client/chats-context.tsx`, `ChatThreadView.tsx`, `ChatEmptyStateView.tsx`; the SSE block in `api.ts` (`streamChatTurn`, `createChatAndSend`, `sendChatMessage`, `ChatTurnHandlers`).
- New: `src/console/client/chat/` — vendored + restyled `thread.tsx`, `thread-list.tsx`, `markdown-text.tsx`, tool-call renderer, message-metadata footer; runtime setup (`useDataStreamRuntime` + `useRemoteThreadListRuntime` + `ThreadHistoryAdapter`); `RemoteThreadListAdapter` (list/initialize/rename/archive/delete) hitting the new routes.
- New: `src/console/client/ChatsPage.tsx` (standalone route, two-pane).
- Rewrite: `src/console/client/WorkspaceChatPanel.tsx` — active thread + compact switcher, shares the runtime; keeps `chatEnabled`/`chatOpen`.
- `src/console/client/ConsoleApp.tsx` — register `automation/chats` route.
- `src/console/client/api.ts` — new chat CRUD helpers (list/create/rename/archive/delete/loadMessages).
- `package.json` — add `@assistant-ui/react`, `@assistant-ui/react-data-stream`, `@assistant-ui/react-markdown`, `remark-gfm`, `assistant-stream`.

## Implementation status (2026-08-28)

Built and verified:

- **Deps added** to `package.json`: `@assistant-ui/react` 0.15, `@assistant-ui/react-data-stream` 0.12,
  `@assistant-ui/react-markdown` 0.14, `assistant-stream` 0.3, `remark-gfm` 4.
- **Backend**
  - `Provider.kind` enum (`anthropic` | `openai`, default `anthropic`); `run-turn.ts` resolves the
    adapter from `providerRow.kind` — fixes the `resolveProvider(agent.provider)` crash.
  - `Message.content` `text` → `json` (parts array); `'context'` dropped from the role enum.
  - `src/automation/message-parts.ts` — `StoredPart`/`StoredMessage`, `storedToProviderMessages`,
    `AssistantPartsBuilder`. Unit-tested (`test/automation-message-parts.test.ts`, 10 cases).
  - `run-turn.ts` — `abortSignal` param + checks; new `tool-result` `ChatEvent`; `aborted` stop reason.
  - `router.ts` — full rewrite. `GET /chats`, `POST /chats` (initialize), `PATCH /chats/:id`
    (rename/archive), `DELETE /chats/:id`, `GET /chats/:id/messages` (history load),
    `POST /chat` (one streamed turn via `createAssistantStreamResponse`, `threadId` in body).
    Ignores client `system`/`tools`; rebuilds history from DB; `workspaceId` → one-call context
    prepend; first user message auto-fills the title.
  - `domain.ts` — `consoleMenu: [{ label: 'Chats', to: '/automation/chats' }]`.
  - Smoke-tested against live Postgres: CRUD, `x-vercel-ai-data-stream: v1` header, 404 on foreign
    chat, user-message persistence as parts, title auto-set, graceful error frame on bad API key.
- **Frontend** (`src/console/client/chat/`)
  - `runtime.tsx` — `ChatRuntimeProvider` = `useRemoteThreadListRuntime({ runtimeHook:
    useDataStreamRuntime(...) })` + `AssistantRuntimeProvider`; `onFinish` → `threads.reload()` +
    `onTurnFinish`.
  - `thread-list-adapter.tsx` — `RemoteThreadListAdapter` over `/api/automation/chats/*`
    (`unstable_useAdapters`/`unstable_Provider` inject the history adapter, mirroring
    `useCloudThreadListAdapter`). `generateTitle` returns an empty stream (no auto-title).
  - `history.ts` — load-only `ThreadHistoryAdapter` (row parts ↔ `ThreadMessageLike`); `append`
    is a no-op (server-authoritative).
  - `Thread.tsx` — lean assistant-ui primitives styled to the console palette; markdown text,
    collapsible reasoning, collapsible tool calls, muted metadata footer, stop button. No
    edit/branch/regenerate.
  - `MarkdownText.tsx` (remark-gfm, no highlighter), `ThreadList.tsx`.
  - `NewChatBar.tsx` + `AgentPicker.tsx` — "New chat" button opens a modal agent picker
    (`Dialog`) rather than an always-visible `<select>`; picking an agent sets the parent's
    `agentId` and calls `threads.switchToNewThread()`. One active agent skips the dialog. The
    pre-existing empty thread still auto-selects the first agent so it's usable without ceremony.
  - The open chat's agent is shown in the `Thread` header (`ChatAgentHeader`), resolved from the
    active thread's `custom.agentId` (added to the `RemoteThreadListAdapter` `list`/`fetch`
    mappings) via the shared `useAgents()` hook — not next to the New button.
  - `ChatsPage.tsx` — standalone `/automation/chats[/:threadId]` two-pane, URL-synced.
  - `WorkspaceChatPanel.tsx` — rewritten: compact `<select>` switcher, shares the runtime,
    passes `workspaceId`; same `{ workspaceId, onTurnDone }` props so `WorkspacePage` is untouched.
  - `ConsoleApp.tsx` — `automation/chats` routes before the `:model/*` catch-all.
  - `Layout.tsx` — `DomainsMenu` now renders a section for a Domain that has only a `consoleMenu`
    (no visible models), so the "Chats" link appears.
  - `api.ts` — SSE helpers replaced with `createChat` / `patchChat` / `deleteChat` / `listChats` /
    `listChatMessages`; `streamChatTurn` and the hand-rolled SSE parser deleted.
  - Deleted: `chats-context.tsx`, `ChatThreadView.tsx`, `ChatEmptyStateView.tsx`.
  - `queryKeys.chatMessages` removed.
- `tsc` clean for `src/`; `bun run build` (framework) + `ratchet build` (console, ~919 KB min JS,
  up from ~270 KB) + `bun test` (96 pass / 129 db-skip / 0 fail) all green.

### Migration (consumer apps)

`Chat`/`Message` are framework builtins; consumers pick up the schema change via `ratchet generate`
+ `ratchet migrate`. It is **breaking with no data conversion** (Q12) — `drizzle-kit` cannot
auto-cast `messages.content` `text` → `jsonb`. The example DB was reset with:

```sql
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
ALTER TABLE providers ADD COLUMN kind varchar NOT NULL DEFAULT 'anthropic'
  CHECK (kind IN ('anthropic','openai'));
-- then: ratchet generate && ratchet migrate  (or `ratchet dev` which pushes)
```

Changelog line: **"Automation → Chats revamp: clears existing chat history; set `Provider.kind`
on each provider row (openai-compatible providers need `openai`)."**

Open follow-ups for the example repo: the pre-existing `workspace_views.sort` drift blocks a clean
`ratchet generate` migration diff (unrelated to this change); the checked-in `example/migrations/`
snapshot set was not regenerated here.

## Deferred (explicitly not this PR)

- Tool approval gates (writes-only or `Agent.toolApproval` enum) + pause/resume streaming.
- Auto-title generation.
- Full branch-tree persistence.
- Syntax highlighting in markdown.
- Repo-wide zod 3 → 4 migration.
- Code-splitting the chat route.
- Persisted workspace-snapshot audit trail.
- Custom "which tabs changed" data part (vs blunt refetch).
