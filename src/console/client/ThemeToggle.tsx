import { MoonIcon, SunIcon } from './icons.js';
import { useTheme } from './theme.js';
import { Button } from './ui/button.js';

/** Icon-only Sun/Moon toggle for the console-wide light/dark preference (`theme.ts`), persisted
 * per-browser. Shared by `Layout`'s header and `WorkspacePage`'s own (separate) header — same idea
 * as `BrandMark`, which those two headers already share for the same reason (`Layout.tsx`). */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </Button>
  );
}
