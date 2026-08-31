import type { ReactNode } from 'react';
import { Dialog as DialogRoot, DialogContent } from './ui/dialog.js';

export interface DialogProps {
  onClose: () => void;
  children: ReactNode;
}

/** A route-driven modal: mounted alongside whatever's already on screen (a `WorkspacePage` tab, a
 * `ModelListPage` table) instead of replacing it, so opening/closing a form never unmounts the
 * page behind it. Built on Radix's `Dialog` (`ui/dialog.tsx`) rather than the hand-rolled
 * portal/Escape-listener/backdrop-click this used to be — same external behavior (Escape or a
 * backdrop click calls `onClose`), plus a focus trap and scroll lock Radix handles for free. Always
 * `open` since there's no separate trigger here: mounting *is* opening, and `onOpenChange(false)`
 * (Escape, backdrop click, or the close button) is the only way `open` would become false, so it
 * maps straight to `onClose` instead of local state. */
export function Dialog({ onClose, children }: DialogProps) {
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>{children}</DialogContent>
    </DialogRoot>
  );
}
