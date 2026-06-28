/**
 * Select primitive — native <select>.
 *
 * `options` is the data shape; the primitive renders one
 * `<option>` per entry. The native control is the accessibility
 * primitive for screen readers (the combobox role).
 */

import { cx } from '../_shared/cx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  id: string;
  options: ReadonlyArray<SelectOption>;
}

const baseClass =
  'block w-full rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-2 ' +
  'text-ui-text-base text-ui-fg ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-ui-danger';

export function Select({ id, options, className, ...rest }: SelectProps): React.JSX.Element {
  return (
    <select id={id} className={cx(baseClass, className)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
