import { defineDomain } from '../core/domain.js';

/** The framework's own built-in Automation Domain. Its `chats`/`messages` models are
 * `console: { hidden: true }` (chat.model.ts, message.model.ts) — chat is surfaced through the
 * assistant-ui `Thread` UI in one place that shares one runtime: the console shell's right-side
 * panel (`console/client/ConsoleChatPanel.tsx`, mounted by `Layout`) and the workspace screen's own
 * right-side panel (`console/client/WorkspaceChatPanel.tsx`). No settings of its own — the Domain
 * still exists so its hidden models stay grouped, but it declares no `consoleMenu`. */
export const AutomationDomain = defineDomain('automation', {});
