/**
 * Input primitive — single-line text input.
 *
 * `id` is required so FormField's `<label htmlFor>` always
 * references a real element (WCAG 2.2 AA — REQ-UI-5). All other
 * attrs are forwarded to the native `<input>`.
 */

import { cx } from '../_shared/cx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
}

const baseClass =
  'block w-full rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-2 ' +
  'text-ui-text-base text-ui-fg placeholder:text-ui-fg-muted ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-ui-danger aria-[invalid=true]:ring-ui-danger';

export function Input({ id, className, type = 'text', ...rest }: InputProps): React.JSX.Element {
  return <input id={id} type={type} className={cx(baseClass, className)} {...rest} />;
}
