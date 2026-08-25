import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DialogProps {
  onClose: () => void;
  children: ReactNode;
}

/** A route-driven modal: mounted alongside whatever's already on screen (a `WorkspacePage` tab, a
 * `ModelListPage` table) instead of replacing it, so opening/closing a form never unmounts the
 * page behind it. Portals to `document.body` so it always sits above the page regardless of where
 * it's rendered in the tree, and closes on Escape or a click on the backdrop itself. */
export function Dialog({ onClose, children }: DialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6 pt-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
        {children}
      </div>
    </div>,
    document.body,
  );
}
