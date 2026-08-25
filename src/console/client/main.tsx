import { createRoot } from 'react-dom/client';
import { ConsoleApp } from './ConsoleApp.js';

/** The console SPA's bundle entry point — bundled by `ratchet build`/`ratchet dev`
 * (src/cli/build-console.ts) with esbuild. Framework-owned: with no consumer-facing extension
 * points on `ConsoleApp` (see ConsoleApp.tsx), there's nothing left for a consumer app to
 * configure here, so this entry lives in the framework instead of being consumer-authored. */
const root = document.getElementById('root')!;
createRoot(root).render(<ConsoleApp />);
