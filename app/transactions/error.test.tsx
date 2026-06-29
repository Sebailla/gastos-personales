/**
 * Tests for transactions segment-level error boundary — slice 3 T-UI-201.
 *
 * REQ-UI-7 (loading state), REQ-UI-8 (a11y), §8.3 of design:
 * - Renders a PageContainer + Card layout.
 * - Title in Spanish copy: "Algo salió mal" (per the design §7.3
 *   shared error copy).
 * - The error message is rendered (so the user sees what happened).
 * - The "Reintentar" button calls `reset` on click.
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

import { TransactionsError } from './error';

describe('TransactionsError — segment error boundary', () => {
  it('renders the Card layout with the Spanish title', () => {
    render(<TransactionsError error={new Error('boom')} reset={() => undefined} />);
    // Title rendered in <h2> inside CardHeader.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Algo salió mal' }),
    ).toBeInTheDocument();
  });

  it('renders the error message inside a CardBody', () => {
    render(<TransactionsError error={new Error('fetch failed')} reset={() => undefined} />);
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
  });

  it('renders a Reintentar (Retry) button that calls `reset` on click', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<TransactionsError error={new Error('boom')} reset={reset} />);
    const retry = screen.getByRole('button', { name: /reintentar/i });
    await user.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
