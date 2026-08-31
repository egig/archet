# Automation agent loop: Mastra feasibility

Status: **research only** — no code changed. Written to answer "can we replace the existing
agent with Mastra?" before committing to an implementation branch. Scope was narrowed up front:
Mastra would replace the **LLM-calling + tool-dispatch loop only** (`run-turn.ts`, `provider.ts`,
`providers/*`); Ratchet keeps owning `Chat`/`Message` as regular Drizzle models and the
permission-scoped tool system in `tool.ts`. The assistant-ui frontend and the `automation-chats`
revamp (`docs-internal/automation-chats-assistant-ui-revamp.md`, shipped days ago) are unaffected
in this scope.

## TL;DR

Feasible, moderate-confidence, not free. Mastra's `Agent` is a reasonable drop-in for the
`runAgentTurn` loop: it takes AI SDK `LanguageModel`s (so `Provider.kind` → `@ai-sdk/anthropic` /
`@ai-sdk/openai` instead of the two hand-rolled adapters), tools can be resolved dynamically
per-request exactly like `resolveAgentTools` already does, and tool `execute()` gets a
per-call context object that's the natural home for `{ db, request, registry }`. The two real
risks are (1) unverified wire-compatibility between Mastra's stream output and the
`assistant-stream`-produced protocol assistant-ui's `useDataStreamRuntime` currently consumes, and
(2) a much heavier dependency tree for what is currently four small files. Neither is a blocker,
both need a spike before committing.

## What stays untouched

- `Chat`/`Message` Drizzle models, migrations, console visibility — no persistence change.
- `tool.ts`'s permission logic: `resolveAgentTools` (Role → grants → concrete `(model, operation)`
  tools) and `executeAgentTool`'s three branches (`executeReadTool`/`executeBuiltinTool`/
  `executeCustomTool`), which re-run `authorizeRequest` / `resolveGrantedFields` /
  `assertWriteFieldsAllowed` / `pickGrantedFields` against the chat's own `request` — this is the
  actual security boundary ("an agent can never do more than the chatting user could over the
  REST API") and has nothing to do with which library drives the LLM call.
- `router.ts`'s security boundary (Q17 in the revamp doc: client `system`/`tools` ignored,
  history rebuilt from the DB, only the latest user message text is trusted) and its
  persist-after-stream contract (Q13: always write an assistant row, even an aborted/empty one).
- `message-parts.ts`'s `StoredPart`/`StoredMessage` shape and `AssistantPartsBuilder` — the
  console's `ThreadHistoryAdapter` reads this format; changing the LLM backend doesn't need to
  touch it.
- The console (`src/console/client/chat/*`) — no change if the streamed wire format is preserved.

## What Mastra would replace

| Current file | Role today | Mastra equivalent |
|---|---|---|
| `run-turn.ts` | Hand-rolled tool-use loop: calls `ChatProvider.stream`, accumulates tool calls, executes them via `tool.ts`, feeds results back, loops up to `MAX_TOOL_ITERATIONS`, enforces `TURN_TIMEOUT_MS` + abort. | `Agent.stream()`/`streamVNext()` — Mastra owns the tool-call loop internally (its own step/iteration cap and `abortSignal` support). |
| `provider.ts` | Provider-agnostic `ChatRequest`/`ChatEvent`/`ChatProvider` contract. | AI SDK's `LanguageModel` interface — Mastra agents take one directly; no Ratchet-owned interface needed. |
| `providers/anthropic.ts`, `providers/openai-compatible.ts`, `providers/index.ts` | Hand-rolled Anthropic SDK + OpenAI-compatible fetch adapters, each re-implementing streaming-delta parsing, tool-call JSON accumulation, stop-reason mapping. | `@ai-sdk/anthropic` / `@ai-sdk/openai` (or `@ai-sdk/openai-compatible` for custom base URLs) — `Provider.kind` picks the factory, `Provider.apiKey`/`url` become its constructor args. Deletes ~250 lines of manual SSE-fragment parsing. |

`Agent` tools would be built with Mastra's `createTool()` from the exact same `AgentTool[]`
`resolveAgentTools` already produces — `spec.parameters` is already a JSON Schema (`toJsonSchema`
in `tool.ts`), so a tool's `inputSchema` can pass that straight through (Mastra accepts Standard
JSON Schema, not just Zod). `tools` on a Mastra `Agent` is a `DynamicArgument`, i.e. a function of
a per-call `requestContext` — call it once per turn with `{ db, request, registry, roleId }` and
have it call `resolveAgentTools` internally, matching today's per-turn resolution. Each tool's
`execute(input, { requestContext })` calls `executeAgentTool` unchanged — `requestContext` is the
carrier for `{ db, request, registry }` that `run-turn.ts` currently threads by hand.

`Provider.apiKey`/`Provider.url` resolution (`resolveProvider(providerRow.kind)`) stays the same
shape, just returns an AI SDK model instance instead of a `ChatProvider`.

The `effort`/`thinking: adaptive` config `anthropic.ts` currently sets on the raw SDK call
(`Agent.config` → `output_config.effort`, `thinking: { type: 'adaptive', display: 'summarized' }`)
has a direct AI SDK v5 equivalent: `providerOptions.anthropic.thinking: { type: 'adaptive',
display: 'summarized' }` plus the top-level `reasoning` effort levels (`low`/.../`max`) — confirmed
in AI SDK's Anthropic-reasoning docs, so nothing here is lost, just moved from Ratchet's own
`ChatRequest.extra` passthrough into Mastra/AI SDK's `providerOptions`.

## Real risks

1. **Streaming wire-format compatibility (biggest unknown).** The frontend's
   `useDataStreamRuntime`/`RemoteThreadListAdapter` (`@assistant-ui/react-data-stream`) consumes
   the AI SDK v5 "UI Message Stream" protocol; today `router.ts` produces it by hand via
   `assistant-stream`'s `createAssistantStreamResponse` + `AssistantPartsBuilder`, consuming
   `run-turn.ts`'s own `ChatEvent`s one at a time. Mastra documents `toUIMessageStreamResponse()` /
   `toDataStreamResponse()` on `Agent.stream()` results, which strongly suggests direct
   wire-compatibility with the same protocol — but this needs to be verified against the exact
   `@assistant-ui/react-data-stream` version pinned in `package.json`, not assumed. Two fallback
   paths if it doesn't line up cleanly: (a) keep consuming Mastra's stream as an async iterable of
   its own chunk types inside the existing `createAssistantStreamResponse` callback — the same
   shape `router.ts` already does with `run-turn.ts`'s `ChatEvent`s, so `AssistantPartsBuilder`,
   the `EMPTY_TURN_NOTICE` handling (Q13), and the abort/timeout persistence contract (Q16) need
   zero changes; or (b) drop `assistant-stream` entirely and let Mastra's response builder own the
   wire format, moving the "persist after stream ends" step (Q13) to whatever finish-hook Mastra
   exposes (needs checking — not yet confirmed to exist). **(a) is the low-risk choice**: it turns
   this into "swap what feeds the loop", not "swap how the HTTP response is built".
2. **Dependency weight.** `@mastra/core` (checked at 1.63.3-alpha) pulls in `ajv`, `croner`,
   `execa`, `ws`, an MCP server SDK, an A2A SDK, and multiple `@ai-sdk/*` packages — a much larger
   surface than today's single `@anthropic-ai/sdk` dependency for four files (~450 lines total
   across `run-turn.ts` + `provider.ts` + `providers/*`). This only affects the server bundle
   (`ratchet build`'s `dist/server.js`), not the console client bundle, but it's a real increase in
   what `ratchet build` ships and what a consumer's `bun install` pulls down for a framework that
   currently prides itself on hand-rolled, dependency-light internals (the router itself replaced
   Hono for exactly this reason, per `CLAUDE.md`).
3. **Test seam.** `run-turn.ts` has an explicit test-only `provider` override
   (`test/automation-run-turn.test.ts`) that unit-tests the loop's control flow (iteration cap,
   usage accumulation, abort/timeout) against a fake `ChatProvider`, no live LLM call. Mastra's
   loop is internal to `Agent.stream()`; the equivalent seam would be AI SDK's `MockLanguageModel`
   (`ai/test`) passed as the agent's `model`. Not a blocker, but the existing test file would need
   a rewrite, not a port, and CLAUDE.md's "no component tests, route-contract + serialization
   tests" house style would need `ai/test`'s mock semantics to actually support asserting on
   tool-loop iteration counts and timeout behavior the same way.
4. **Multi-provider scope creep temptation.** Mastra's headline feature is 40+-provider routing;
   Ratchet only needs Anthropic + one openai-compatible base-URL today (`Provider.kind`). Worth
   deciding explicitly to *not* expand `Provider.kind`'s enum just because Mastra makes it easy —
   that's a separate product decision, not a consequence of this swap.

## Recommendation if this goes ahead

Scope it exactly like risk 1's low-risk path: replace `run-turn.ts` + `provider.ts` +
`providers/*` with a `mastra-agent.ts` that builds a Mastra `Agent` per turn (model from
`Provider.kind`, tools from `resolveAgentTools` wrapped in `createTool()`), and keep consuming its
stream as an async iterable inside the existing `createAssistantStreamResponse` callback in
`router.ts` — same shape as today's `for await (const event of runAgentTurn(...))` loop, just
sourced from Mastra's stream instead. That keeps every other Q-numbered decision in the
`automation-chats-assistant-ui-revamp.md` doc (security boundary, persistence contract, abort
handling, empty-turn notices) untouched and testable the same way, and confines the actual
unknown (does Mastra's per-chunk stream shape carry text/reasoning/tool-call/tool-result/usage
cleanly enough to keep feeding `AssistantPartsBuilder`) to one file. A short spike — one `Agent`,
one tool, streamed against a real Anthropic key, chunk shapes logged — would settle risk 1 and the
test-seam question (risk 3) before a real implementation PR, the same way the assistant-ui revamp
was grilled into a decisions table before being built.

## Sources

- [Mastra docs](https://mastra.ai/) — Agent overview, `createTool()`, streaming reference (site
  itself is not reachable from this environment's egress proxy; summarized via search snippets).
- [mastra-ai/mastra on GitHub](https://github.com/mastra-ai/mastra) — `packages/core/src/agent/agent.ts`,
  `packages/core/src/tools/tool.ts`, `packages/core/package.json` (fetched directly).
- [AI SDK Anthropic reasoning / provider options](https://ai-sdk.dev/docs/ai-sdk-core/reasoning) —
  `providerOptions.anthropic.thinking` + effort-level equivalence to the current `output_config.effort`.
