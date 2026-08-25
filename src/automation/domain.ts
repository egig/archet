import { defineDomain } from '../core/domain.js';

/** The framework's own built-in Automation Domain — declares only a console menu, no settings.
 * The Chat console page is `console: { hidden: true }` (chat.model.ts) so it never reaches the
 * sidebar's auto-derived model list; this is what actually puts "Chat" in the Automation Domain's
 * section instead (see `codegen/builtins.ts`, `console/client/Layout.tsx`). */
export const AutomationDomain = defineDomain('automation', {
  consoleMenu: [{ label: 'Chat', to: '/chat' }],
});
