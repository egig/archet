import { createRoot } from 'react-dom/client';
import { ConsoleApp } from './ConsoleApp.js';

/** The console SPA's bundle entry point — bundled by `ratchet build`/`ratchet dev`
 * (src/cli/build-console.ts) with `Bun.build`. Framework-owned: with no consumer-facing extension
 * points on `ConsoleApp` (see ConsoleApp.tsx), there's nothing left for a consumer app to
 * configure here, so this entry lives in the framework instead of being consumer-authored. */
// keep the browser tab title in sync with the configured brand (same fallback as `BrandMark`) —
// the server shell ships a static "Ratchet console" `<title>` since brand is a client-bundle-only
// config (`ratchet.config.ts`'s `brand`), so it's applied here once the bundle loads.
document.title = __CONSOLE_BRAND__.name ?? 'Ratchet console';

const root = document.getElementById('root')!;
createRoot(root).render(<ConsoleApp />);
