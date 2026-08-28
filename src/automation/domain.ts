import { defineDomain } from '../core/domain.js';

/** The framework's own built-in Automation Domain. Its `chats`/`messages` models are
 * `console: { hidden: true }` (chat.model.ts, message.model.ts) — chat is surfaced through the
 * assistant-ui `Thread` UI in two places that share one runtime: the standalone `/automation/chats`
 * page (this `consoleMenu` link, routed in `console/client/ConsoleApp.tsx`) and the workspace
 * screen's right-side panel (`console/client/WorkspaceChatPanel.tsx`). No settings of its own. */
export const AutomationDomain = defineDomain('automation', {
  consoleMenu: [{ label: 'Chats', to: '/automation/chats' }],
});
