/**
 * FieldError primitive — inline error message for a form field.
 *
 * Renders <div role="alert" aria-live="polite" aria-atomic="true">
 * so screen readers announce the error when it appears. The id
 * is what the form control's aria-describedby points at
 * (REQ-UI-6 — inline errors with aria-describedby wiring).
 */

import { cx } from '../_shared/cx';

export interface FieldErrorProps {
  /** id referenced by the form control's aria-describedby. */
  id: string;
  message: string;
  className?: string;
}

export function FieldError({ id, message, className }: FieldErrorProps): React.JSX.Element {
  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={cx('text-ui-text-sm text-ui-danger', className)}
    >
      {message}
    </div>
  );
}
