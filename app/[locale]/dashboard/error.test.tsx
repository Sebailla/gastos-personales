/**
 * Tests for the dashboard segment-level error boundary —
 * slice 4 T-UI-301.
 *
 * Mirrors the accounts + transactions error boundary tests.
 * Per design §8.3: Next.js convention requires Client
 * Components for `error.tsx` (the `reset` callback is a
 * client-side function). The boundary renders inside a
 * PageContainer + Card + CardHeader + CardBody layout, with
 * the CardFooter holding the Retry button.
 *
 * Spanish copy per design §7.3 (the dashboard's copy is
 * Spanish — matches the rest of the dashboard segment):
 * - Title: "Algo salió mal"
 * - Message body: error.message || "No pudimos cargar el dashboard."
 * - Retry: "Reintentar"
 *
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

import { DashboardError } from './error';

describe('DashboardError — segment error boundary (slice 4 T-UI-301)', () => {
  it('renders the Card layout with the Spanish title', () => {
    render(<DashboardError error={new Error('boom')} reset={() => undefined} />);
    // Title rendered in <h2> inside CardHeader.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Algo salió mal' }),
    ).toBeInTheDocument();
  });

  it('renders the error message inside a CardBody', () => {
    render(<DashboardError error={new Error('fetch failed')} reset={() => undefined} />);
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
  });

  it('renders a Reintentar (Retry) button that calls `reset` on click', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<DashboardError error={new Error('boom')} reset={reset} />);
    const retry = screen.getByRole('button', { name: /reintentar/i });
    await user.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
