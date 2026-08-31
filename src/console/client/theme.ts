import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ratchet:theme';

/** Exactly what `router.ts`'s inlined pre-hydration script (`themeBootstrapScript`) already does,
 * kept in sync by hand since one runs as a plain `<script>` string server-side and the other as
 * real TypeScript client-side — there's no way to share the literal source between them. Falls
 * back to the OS/browser preference the first time (no stored choice yet); `toggleTheme` below is
 * what pins it to an explicit value. */
function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore — e.g. private browsing with storage disabled
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Console-wide light/dark toggle, persisted per-browser. Reads the same starting value the inline
 * bootstrap script (`router.ts`) already applied before this component mounted — this effect only
 * re-applies it defensively (e.g. React 19 strict-mode double-invoke) and keeps it in sync going
 * forward. */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  return { theme, toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
