/**
 * Textarea primitive — multi-line input. Same contract as Input.
 */

import { cx } from '../_shared/cx';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
}

const baseClass =
  'block w-full rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-2 ' +
  'text-ui-text-base text-ui-fg placeholder:text-ui-fg-muted ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-ui-danger';

export function Textarea({ id, className, rows = 4, ...rest }: TextareaProps): React.JSX.Element {
  return <textarea id={id} rows={rows} className={cx(baseClass, className)} {...rest} />;
}
