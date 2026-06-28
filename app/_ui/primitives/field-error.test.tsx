// @vitest-environment jsdom
/** T-UI-012: FieldError — role=alert + aria-live. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldError } from './field-error';

describe('FieldError', () => {
  it('renders the message with role=alert and aria-live=polite', () => {
    render(<FieldError id="amount-err" message="Amount must be greater than 0" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('id', 'amount-err');
    expect(alert).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveTextContent('Amount must be greater than 0');
  });
});
