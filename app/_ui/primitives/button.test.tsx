// @vitest-environment jsdom
/**
 * T-UI-003 + T-UI-004: Button primitive.
 *
 * Per design §3.2.1 + §7.1:
 * - variant: 'primary' | 'secondary' | 'ghost' | 'danger' (default 'primary')
 * - isLoading: renders Spinner + disabled + aria-busy="true"
 * - renders <button> with focus-visible:ring-2 (REQ-UI-4)
 * - forwards all standard button attrs + className override
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

// The Spinner (rendered when isLoading=true) uses
// `useTranslations` from `next-intl`. Tests that render
// the Button outside a `NextIntlClientProvider` need a
// stub so the hook returns the key verbatim.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('Button', () => {
  it('renders children inside a <button> element', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('defaults to the primary variant', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('bg-ui-accent');
    expect(btn.className).toContain('text-ui-accent-fg');
  });

  it('renders the danger variant when variant="danger"', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('bg-ui-danger');
  });

  it('renders the ghost variant without an accent background', () => {
    render(<Button variant="ghost">Cancel</Button>);
    const btn = screen.getByRole('button', { name: 'Cancel' });
    expect(btn.className).not.toContain('bg-ui-accent');
    expect(btn.className).not.toContain('bg-ui-danger');
  });

  it('renders a focus-visible ring on the button element (REQ-UI-4)', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('focus-visible:ring-2');
  });

  it('renders isLoading state with Spinner + disabled + aria-busy', () => {
    render(<Button isLoading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    // The Spinner primitive exposes role="status" with aria-label="Loading".
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('appends a custom className override', () => {
    render(<Button className="mt-4">Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('mt-4');
  });
});
