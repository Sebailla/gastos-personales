// @vitest-environment jsdom
/** T-UI-013: FormField — composes label + control + FieldError. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from './form-field';
import { Input } from './input';

describe('FormField', () => {
  it('renders a <label htmlFor> paired with the child id', () => {
    render(
      <FormField id="amount" label="Amount">
        <Input id="amount" />
      </FormField>,
    );
    const label = screen.getByText('Amount');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'amount');
  });

  it('sets aria-describedby on the child when error is present', () => {
    render(
      <FormField id="amount" label="Amount" error="Amount must be > 0">
        <Input id="amount" />
      </FormField>,
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorEl = describedBy ? document.getElementById(describedBy) : null;
    expect(errorEl).toHaveTextContent('Amount must be > 0');
  });
});
