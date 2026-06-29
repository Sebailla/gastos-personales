// @vitest-environment jsdom
/**
 * T-UI-006: Textarea primitive. Same contract as Input
 * (id required, aria pass-through). Multi-line text.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders a <textarea> with the given id', () => {
    render(<Textarea id="memo" />);
    const ta = screen.getByRole('textbox');
    expect(ta).toBeInTheDocument();
    expect(ta).toHaveAttribute('id', 'memo');
    expect(ta.tagName).toBe('TEXTAREA');
  });

  it('passes through aria-describedby', () => {
    render(<Textarea id="notes" aria-describedby="notes-err" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'notes-err');
  });
});
