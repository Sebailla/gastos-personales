// @vitest-environment jsdom
/** T-UI-010 + T-UI-011: Combobox Client Component — search + keyboard nav. */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox } from './combobox';

describe('Combobox', () => {
  it('renders a <select> (semantic) + <input type="search"> (visual)', () => {
    render(
      <Combobox
        id="account"
        value={null}
        onChange={() => {}}
        options={[
          { value: 'a1', label: 'Main ARS account' },
          { value: 'a2', label: 'USD wallet' },
        ]}
        aria-label="Account"
      />,
    );
    const select = document.getElementById('account-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe('SELECT');
    const search = screen.getByRole('searchbox', { name: 'Account' });
    expect(search).toBeInTheDocument();
  });

  it('fires onChange when the underlying <select> changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Combobox
        id="account"
        value={null}
        onChange={onChange}
        options={[{ value: 'a1', label: 'Main' }]}
        aria-label="Account"
      />,
    );
    const select = document.getElementById('account-select') as HTMLSelectElement;
    await user.selectOptions(select, 'a1');
    expect(onChange).toHaveBeenCalledWith('a1');
  });

  it('renders disabled options with the disabled attribute', () => {
    render(
      <Combobox
        id="account"
        value={null}
        onChange={() => {}}
        options={[
          { value: 'a1', label: 'Active' },
          { value: 'a2', label: 'Archived', disabled: true },
        ]}
        aria-label="Account"
      />,
    );
    const archived = screen.getByRole('option', { name: 'Archived' });
    expect(archived).toBeDisabled();
  });
});
