import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './utils.js';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** The console's primitive text input — compact (32px), token-based border/background so it
 * follows the light/dark toggle, one focus ring shared with `Button`/`Dialog`. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
