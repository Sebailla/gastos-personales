/**
 * RadioGroup primitive — composed of <fieldset> + <legend> +
 * <input type="radio"> items. Server Component; pure props.
 *
 * The <fieldset>+<legend> pair gives screen readers a single
 * accessible name for the whole group (WCAG 2.2 AA — REQ-UI-5).
 */

import { cx } from '../_shared/cx';

export interface RadioGroupItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  /** Visible legend text. Becomes the fieldset's accessible name. */
  legend: string;
  value: string;
  onChange: (value: string) => void;
  items: ReadonlyArray<RadioGroupItem>;
  className?: string;
}

export function RadioGroup({
  name,
  legend,
  value,
  onChange,
  items,
  className,
}: RadioGroupProps): React.JSX.Element {
  return (
    <fieldset className={cx('flex flex-col gap-ui-space-2', className)}>
      <legend className="text-ui-text-sm font-ui-font-medium text-ui-fg">{legend}</legend>
      {items.map((item) => {
        const id = `${name}-${item.value}`;
        return (
          <label
            key={item.value}
            htmlFor={id}
            className="inline-flex items-center gap-ui-space-2 text-ui-text-sm text-ui-fg"
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={item.value}
              checked={value === item.value}
              disabled={item.disabled}
              onChange={() => onChange(item.value)}
              className="h-ui-space-4 w-ui-space-4 text-ui-accent focus-visible:ring-2 focus-visible:ring-ui-accent"
            />
            {item.label}
          </label>
        );
      })}
    </fieldset>
  );
}
