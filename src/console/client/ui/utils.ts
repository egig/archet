import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges conditional class lists (`clsx`) and then resolves conflicting Tailwind utilities in
 * favor of the last one (`tailwind-merge`) — e.g. `cn('px-2', condition && 'px-4')` always ends up
 * `px-4` when `condition` is true, instead of both classes reaching the DOM and letting CSS source
 * order decide. Every `ui/` primitive below takes a `className` prop through this so a caller can
 * override any part of a variant's classes without fighting specificity. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
