import { defineDomain } from '../core/domain.js';

/** The framework's own built-in Automation Domain. Its `chats`/`messages` models are
 * `console: { hidden: true }` (chat.model.ts, message.model.ts) — chat is surfaced only via the
 * workspace screen's right-side panel (`console/client/WorkspaceChatPanel.tsx`), not the console
 * sidebar, so this Domain declares neither settings nor a console menu (see `codegen/builtins.ts`
 * for why it's still registered as a built-in Domain). */
export const AutomationDomain = defineDomain('automation');
