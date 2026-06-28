'use client';
/**
 * Combobox primitive — Client Component.
 *
 * Per design §3.2.8: searchable combobox on <select> +
 * <input type="search">. The native <select> is the semantic
 * primitive for screen readers (the combobox role). The visible
 * <input type="search"> is the visual search field. Selection
 * happens via the <select>; the search filters the rendered
 * <option>s by `option.label.includes(query)`.
 *
 * Keyboard: native <select> handles ArrowDown / ArrowUp / Enter;
 * <input type="search"> handles Escape (clears the query).
 *
 * No new dep (no downshift, no Radix).
 */

import { useMemo, useState, useId } from 'react';
import { cx } from '../_shared/cx';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: ReadonlyArray<ComboboxOption>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Accessible label. Used by the search input; the FormField label pairs via id. */
  'aria-label'?: string;
}

export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Search…',
  required,
  disabled,
  'aria-label': ariaLabel,
}: ComboboxProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const listboxId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="flex flex-col gap-ui-space-2">
      <input
        id={id}
        type="search"
        role="searchbox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-autocomplete="list"
        placeholder={placeholder}
        disabled={disabled}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQuery('');
          }
        }}
        className={cx(
          'block w-full rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-2',
          'text-ui-text-base text-ui-fg placeholder:text-ui-fg-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2',
          'disabled:opacity-50',
        )}
      />
      <select
        id={`${id}-select`}
        aria-label={ariaLabel}
        required={required}
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        size={Math.min(filtered.length, 6)}
        className={cx(
          'block w-full rounded-ui-md border border-ui-border bg-ui-bg',
          'text-ui-text-base text-ui-fg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2',
          'disabled:opacity-50',
        )}
      >
        {filtered.length === 0 && (
          <option value="" disabled>
            No matches
          </option>
        )}
        {filtered.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
