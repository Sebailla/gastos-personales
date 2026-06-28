// @vitest-environment jsdom
/** T-UI-009: RadioGroup primitive — <fieldset> + <legend> + items. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RadioGroup } from './radio-group';

describe('RadioGroup', () => {
  it('renders a <fieldset> with a <legend> and one radio per item', () => {
    render(
      <RadioGroup
        name="direction"
        legend="Direction"
        value="INCOME"
        onChange={() => {}}
        items={[
          { value: 'INCOME', label: 'Income' },
          { value: 'EXPENSE', label: 'Expense' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Direction' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Income' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Expense' })).not.toBeChecked();
  });
});
