/**
 * Tests for accounts segment-level error boundary — slice 2 T-UI-101.
 *
 * REQ-UI-7 (loading state), REQ-UI-8 (a11y), §8.3 of design:
 * - Renders a PageContainer + Card layout.
 * - Title in English copy: "Something went wrong".
 * - The error message is rendered (so the user sees what happened).
 * - The "Retry" button calls `reset` on click.
 *
 * The `error.tsx` is a Client Component (per Next.js convention).
 * The `useRouter` hook is stubbed so the boundary can render
 * without an App Router context.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
}));

import { AccountsError } from './error';

describe('AccountsError — segment error boundary', () => {
  it('renders the Card layout with the English title', () => {
    render(<AccountsError error={new Error('boom')} reset={() => undefined} />);
    // Title rendered in <h2> inside CardHeader.
    expect(screen.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeInTheDocument();
  });

  it('renders the error message inside a CardBody', () => {
    render(<AccountsError error={new Error('fetch failed')} reset={() => undefined} />);
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
  });

  it('renders a Retry button that calls `reset` on click', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<AccountsError error={new Error('boom')} reset={reset} />);
    const retry = screen.getByRole('button', { name: /retry/i });
    await user.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
