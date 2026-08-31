/** The console's own UI primitive layer — unstyled [Radix Primitives](https://www.radix-ui.com/primitives)
 * (accessibility/keyboard/focus-trap behavior) restyled onto the token layer in `styles.css`
 * (`bg-background`, `text-foreground`, `border-border`, ... — light/dark aware via the `.dark`
 * class `theme.ts` toggles) with [`class-variance-authority`](https://cva.style) for variants and
 * `cn()` (`clsx` + `tailwind-merge`) so every prop-driven class list still merges predictably with
 * a caller's own `className` override.
 *
 * This is the first slice of a broader console redesign — `Button`/`Input`/`Label`/`Dialog` today,
 * with `Select`, a `DropdownMenu`, and the console's comboboxes (`ReferenceCombobox`,
 * `TreeCombobox`, `ManyToManyMultiSelect`) restyled onto `Popover` to follow in later passes (see
 * CHANGELOG.md). Most of the console's own hand-rolled components haven't been migrated onto these
 * tokens yet either — importing from here today gets you a primitive that's already
 * light/dark-aware and keyboard-accessible, composed into a console shell that mostly isn't yet. */
export { Button, type ButtonProps } from './button.js';
export { Input, type InputProps } from './input.js';
export { Label, type LabelProps } from './label.js';
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogTitle,
  DialogDescription,
  DialogOverlay,
  DialogContent,
  type DialogContentProps,
} from './dialog.js';
export { cn } from './utils.js';
