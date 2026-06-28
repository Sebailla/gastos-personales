// @vitest-environment jsdom
/**
 * T-UI-008: Checkbox primitive — native <input type="checkbox">.
 *
 * Paired with FormField. id + checked + onChange props. The
 * checked attribute reflects the current state and toggles
 * accessibility tree semantics.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('renders a checkbox with the given id and unchecked by default', () => {
    render(<Checkbox id="archived" />);
    const cb = screen.getByRole('checkbox');
    expect(cb).toHaveAttribute('id', 'archived');
    expect(cb).not.toBeChecked();
  });

  it('reflects the checked state via the checked prop', () => {
    render(<Checkbox id="archived" checked onChange={() => {}} readOnly />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
