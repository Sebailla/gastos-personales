/**
 * Tests for `DashboardMonthSwitcher` Client Component —
 * slice 4 T-UI-304.
 *
 * Per design §9.3 + §15.4 (analogous to
 * DashboardAccountPicker) + REQ-UI-7 + REQ-UI-8:
 * - Renders a `<nav aria-label='Month switcher'>` with three
 *   `<Link>`s: previous, current, next.
 * - Each link carries `?month=YYYY-MM` (and PRESERVES any
 *   `?accountId=` the user already had deep-linked to, so
 *   the picker + the switcher play nicely together).
 * - Date math in pure helpers `prevMonth(YYYY-MM)` +
 *   `nextMonth(YYYY-MM)` handles Dec→Jan + Jan→Dec rollover.
 * - When no `?month=` is present, the switcher defaults to
 *   the current UTC month (so the user lands on 'today').
 * - The CURRENT month is rendered as a span (non-link) so the
 *   user can see which month is selected at a glance — the
 *   previous + next links flank it.
 *
 * Per the orchestrator's pre-flight note, the switcher is
 * `<Link>`-based (not `<button>`-based) so right-click
 * 'open in new tab' works.
 *
 * Pure helper tests cover the Dec→Jan rollover edge case:
 * - nextMonth('2026-12') === '2027-01'
 * - prevMonth('2026-01') === '2025-12'
 * - nextMonth('2026-01') === '2026-02'
 * - prevMonth('2026-12') === '2026-11'
 *
 * No logic in tests (root AGENTS.md §10.5): assertions are
 * direct `getByRole` + `getByText` checks against the
 * rendered output.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardMonthSwitcher, prevMonth, nextMonth } from './dashboard-month-switcher';

describe('DashboardMonthSwitcher (slice 4 T-UI-304)', () => {
  describe('pure date math', () => {
    it('nextMonth rolls Dec over to Jan of the next year', () => {
      expect(nextMonth('2026-12')).toBe('2027-01');
    });
    it('prevMonth rolls Jan back to Dec of the previous year', () => {
      expect(prevMonth('2026-01')).toBe('2025-12');
    });
    it('nextMonth crosses year boundaries correctly mid-year', () => {
      expect(nextMonth('2026-01')).toBe('2026-02');
      expect(nextMonth('2026-06')).toBe('2026-07');
    });
    it('prevMonth crosses year boundaries correctly mid-year', () => {
      expect(prevMonth('2026-06')).toBe('2026-05');
      expect(prevMonth('2026-12')).toBe('2026-11');
    });
  });

  describe('render', () => {
    it('renders prev + current + next with the Dec→Jan rollover correctly', () => {
      const NOW = new Date('2026-12-15T00:00:00.000Z');
      render(
        <DashboardMonthSwitcher
          currentMonth="2026-12"
          currentAccountId={null}
          now={NOW}
        />,
      );
      const nav = screen.getByRole('navigation', { name: /month switcher/i });
      expect(nav).toBeInTheDocument();
      // Previous link → 2026-11.
      expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
        'href',
        '/dashboard?month=2026-11',
      );
      // Next link → 2027-01 (Dec→Jan rollover).
      expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute(
        'href',
        '/dashboard?month=2027-01',
      );
      // Current month is rendered (non-link) so the user can see what's selected.
      expect(screen.getByText('2026-12')).toBeInTheDocument();
    });

    it('renders prev + current + next with the Jan→Dec rollover correctly', () => {
      const NOW = new Date('2026-01-15T00:00:00.000Z');
      render(
        <DashboardMonthSwitcher
          currentMonth="2026-01"
          currentAccountId={null}
          now={NOW}
        />,
      );
      // Previous link → 2025-12 (Jan→Dec back-rollover).
      expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
        'href',
        '/dashboard?month=2025-12',
      );
      expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute(
        'href',
        '/dashboard?month=2026-02',
      );
      expect(screen.getByText('2026-01')).toBeInTheDocument();
    });

    it('preserves an active ?accountId= when navigating between months', () => {
      const NOW = new Date('2026-06-15T00:00:00.000Z');
      render(
        <DashboardMonthSwitcher
          currentMonth="2026-06"
          currentAccountId="acct-123"
          now={NOW}
        />,
      );
      expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
        'href',
        '/dashboard?accountId=acct-123&month=2026-05',
      );
      expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute(
        'href',
        '/dashboard?accountId=acct-123&month=2026-07',
      );
    });

    it('falls back to the current UTC month when currentMonth is omitted', () => {
      const NOW = new Date('2026-07-04T12:00:00.000Z');
      render(
        <DashboardMonthSwitcher
          currentMonth={null}
          currentAccountId={null}
          now={NOW}
        />,
      );
      // 2026-07 surfaces as the current month label.
      expect(screen.getByText('2026-07')).toBeInTheDocument();
      // Next link → 2026-08.
      expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute(
        'href',
        '/dashboard?month=2026-08',
      );
      // Previous link → 2026-06.
      expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
        'href',
        '/dashboard?month=2026-06',
      );
    });
  });
});
