import { createRoot } from 'react-dom/client';
import { ConsoleApp } from './ConsoleApp.js';
// `ratchet:custom-forms` isn't a real package — a Bun.build plugin (src/cli/build-console.ts)
// resolves it to the consuming project's generated `<generatedDir>/console-forms.ts` (built by
// `ratchet generate` from every `models/**/*.form.tsx`, see scan-forms.ts/forms-gen.ts). That's
// the one consumer-facing extension point `ConsoleApp` has, so this entry — otherwise a fixed,
// per-app-identical shell — still lives in the framework rather than being consumer-authored.
import { customForms } from 'ratchet:custom-forms';

// keep the browser tab title in sync with the configured brand (same fallback as `BrandMark`) —
// the server shell ships a static "Ratchet console" `<title>` since brand is a client-bundle-only
// config (`ratchet.config.ts`'s `brand`), so it's applied here once the bundle loads.
document.title = __CONSOLE_BRAND__.name ?? 'Ratchet console';

const root = document.getElementById('root')!;
createRoot(root).render(<ConsoleApp customForms={customForms} />);
