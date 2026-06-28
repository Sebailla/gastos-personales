/**
 * FormField primitive — composes Label + control + FieldError.
 *
 * Per design §3.2.3: renders <label htmlFor={id}> paired with
 * the form control's id. When `error` is present, the child
 * receives aria-describedby pointing at the FieldError's id,
 * and aria-invalid="true" (REQ-UI-6).
 *
 * The child is cloned via React.cloneElement to inject the a11y
 * attrs without forcing the child to know about FormField.
 */

import { Children, cloneElement, isValidElement } from 'react';
import { FieldError } from './field-error';

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({
  id,
  label,
  required,
  description,
  error,
  children,
}: FormFieldProps): React.JSX.Element {
  const errorId = `${id}-error`;
  const descriptionId = description ? `${id}-description` : undefined;
  const describedBy = [errorId, descriptionId].filter(Boolean).join(' ') || undefined;

  const enhancedChild = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const existing = (child.props ?? {}) as Record<string, unknown>;
    return cloneElement(
      child as React.ReactElement<Record<string, unknown>>,
      {
        id,
        'aria-describedby': describedBy ?? existing['aria-describedby'],
        'aria-invalid': error ? 'true' : existing['aria-invalid'],
      } as Record<string, unknown>,
    );
  });

  return (
    <div className="flex flex-col gap-ui-space-1">
      <label htmlFor={id} className="text-ui-text-sm font-ui-font-medium text-ui-fg">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-ui-danger">
            *
          </span>
        )}
      </label>
      {description && (
        <p id={descriptionId} className="text-ui-text-xs text-ui-fg-muted">
          {description}
        </p>
      )}
      {enhancedChild}
      {error && <FieldError id={errorId} message={error} />}
    </div>
  );
}
