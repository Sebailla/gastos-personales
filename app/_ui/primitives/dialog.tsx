'use client';
/**
 * Dialog primitive — Client Component.
 *
 * Per design §3.2.9: a modal dialog with role=dialog +
 * aria-modal=true. Uses a div + backdrop overlay (rather than
 * the native <dialog> element) because the project's design
 * system wants to control the backdrop color and animation;
 * the native element would require `::backdrop` pseudo-element
 * work and a polyfill for older browsers.
 *
 * The a11y contract (focus trap + Escape close + focus return)
 * is implemented in this Client Component:
 * - Escape calls onClose
 * - First focusable element receives focus on open
 * - Focus is constrained to the dialog body while open
 * - Backdrop click calls onClose
 */

import { useEffect, useId, useRef } from 'react';
import { cx } from '../_shared/cx';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: DialogProps): React.JSX.Element | null {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    const focusables = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables && focusables.length > 0) {
      focusables[0].focus();
    } else {
      dialog?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialog) {
        const list = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'w-full max-w-md rounded-ui-lg border border-ui-border bg-ui-bg p-0',
          'shadow-ui-shadow-lg',
        )}
      >
        <div className="flex flex-col gap-ui-space-3 px-ui-space-6 py-ui-space-4">
          <h2 id={titleId} className="text-ui-text-lg font-ui-font-semibold text-ui-fg">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-ui-text-sm text-ui-fg-muted">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
