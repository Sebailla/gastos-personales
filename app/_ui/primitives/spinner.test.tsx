// @vitest-environment jsdom
/**
 * T-UI-018: Spinner primitive.
 *
 * Per design §3.2.8: inline SVG with role="status" + aria-label.
 * The `size` prop picks a pixel-friendly dimension; the visual is
 * an animated rotating ring (CSS-only — no JS animation loop).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './spinner';

describe('Spinner', () => {
  it('renders a status element with an aria-label', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Loading');
  });

  it('accepts a custom aria-label override', () => {
    render(<Spinner aria-label="Submitting transaction" />);
    expect(screen.getByRole('status', { name: 'Submitting transaction' })).toBeInTheDocument();
  });
});
