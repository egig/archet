import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils.js';

/** Compact by default (28px `sm`, 32px `default`) — the console's controls are meant to read as a
 * dense, Linear-style admin tool, not a spacious marketing form. Every variant shares one focus
 * ring (`--ring`, see styles.css) and disabled treatment so a caller never has to reproduce those
 * by hand. */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground hover:opacity-90',
        secondary: 'bg-muted text-foreground hover:bg-border/60',
        outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
        ghost: 'bg-transparent text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2.5 text-[0.8125rem]',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/** The console's primitive button — every variant/size the built-in console UI needs, and the same
 * one a consumer's `*.form.tsx`/`*.input.tsx` gets via `@egig/ratchet/console/client` (still
 * experimental — see that barrel's export comment). `type="button"` by default since most of the
 * console's own buttons are inside forms handled by explicit `onClick`/`onSubmit`, not native
 * submit; pass `type="submit"` to opt back in. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
