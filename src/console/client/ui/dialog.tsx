import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XMarkIcon } from '../icons.js';
import { cn } from './utils.js';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-black/40', className)}
      {...props}
    />
  );
});

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Renders the default top-right close button. Set `false` when the content already has its own
   * (e.g. a form's own Cancel action doubles as the close affordance). */
  showClose?: boolean;
}

/** Radix's positioning/overlay/focus-trap/Escape-to-close, restyled onto the console's tokens
 * (`bg-background`, `border-border`) instead of the hardcoded `bg-white` the hand-rolled dialog
 * used — this is what makes the dialog chrome itself respond to the dark-mode toggle.
 *
 * Radix's `Dialog.Content` expects a `Dialog.Title` descendant for its accessible name; the
 * console's own call sites (see `Dialog.tsx`, `ui/index.ts`'s "app-level `Dialog`" note) render
 * whatever `ModelFormPage`/a custom form's own plain `<h1>` as their heading, not this primitive's
 * `DialogTitle` — Radix logs a dev-only a11y warning for that mismatch until those headings are
 * migrated (tracked as follow-up work, not fixed in this pass). */
export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  function DialogContent({ className, children, showClose = true, ...props }, ref) {
    return (
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            'fixed left-1/2 top-16 z-50 w-[calc(100%-3rem)] max-w-xl -translate-x-1/2',
            'max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl',
            'focus:outline-none',
            className,
          )}
          {...props}
        >
          {children}
          {showClose && (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4 rounded-md p-1 text-muted-foreground',
                'hover:bg-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
