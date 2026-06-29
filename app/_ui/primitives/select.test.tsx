// @vitest-environment jsdom
/**
 * T-UI-007: Select primitive — native <select>.
 *
 * Per design §3.2.2/§7.1: native <select> with id + options.
 * One <option> per entry. aria-describedby pass-through.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select } from './select';

describe('Select', () => {
  it('renders a <select> with one <option> per entry', () => {
    render(
      <Select
        id="currency"
        options={[
          { value: 'ARS', label: 'Argentine peso' },
          { value: 'USD', label: 'US dollar' },
        ]}
      />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'currency');
    expect(screen.getByRole('option', { name: 'Argentine peso' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'US dollar' })).toBeInTheDocument();
  });

  it('passes through aria-describedby', () => {
    render(
      <Select
        id="currency"
        aria-describedby="currency-err"
        options={[{ value: 'ARS', label: 'ARS' }]}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', 'currency-err');
  });
});
