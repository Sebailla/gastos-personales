// @vitest-environment jsdom
/**
 * T-UI-005: Input primitive.
 *
 * Per design §3.2.2: text input paired with FormField. `id` is
 * required (TypeScript) so FormField's `<label htmlFor={id}>`
 * always references a real element. Forwards all standard
 * `<input>` attrs.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './input';

describe('Input', () => {
  it('renders an <input> with the given id and the right type', () => {
    render(<Input id="email" type="email" />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('id', 'email');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('passes through aria-describedby and aria-invalid', () => {
    render(<Input id="amount" aria-describedby="amount-err" aria-invalid="true" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'amount-err');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('forwards a placeholder attribute', () => {
    render(<Input id="memo" placeholder="optional" />);
    expect(screen.getByPlaceholderText('optional')).toBeInTheDocument();
  });
});
