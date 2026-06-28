/**
 * Checkbox primitive — native <input type="checkbox">. Paired
 * with FormField which provides the <label htmlFor> pairing.
 */

import { cx } from '../_shared/cx';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
}

export function Checkbox({
  id,
  className,
  type = 'checkbox',
  ...rest
}: CheckboxProps): React.JSX.Element {
  return (
    <input
      id={id}
      type={type}
      className={cx(
        'h-ui-space-4 w-ui-space-4 rounded-ui-sm border-ui-border text-ui-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2',
        'disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
}
