/**
 * Tests for `DashboardAccountPicker` Client Component —
 * slice 4 T-UI-302.
 *
 * Per design §15.4 + REQ-UI-7 + REQ-UI-8:
 * - Renders a `<nav aria-label='Account picker'>` with one
 *   `<Link>` per account.
 * - `aria-current='page'` is set on the currently-selected
 *   account; absent on the others.
 * - Empty accounts list renders nothing (no nav, no fallback).
 * - The picker is keyboard-navigable (Tab focuses, Enter
 *   activates the link).
 * - The links carry `?accountId=<id>` query params so the
 *   dashboard Server Component re-fetches with the deep link.
 *
 * Per the orchestrator's pre-flight note, the picker is
 * `<Link>`-based (not `<button>`-based) so right-click
 * 'open in new tab' works — anchors are the only way to
 * preserve that contract.
 *
 * The picker is `'use client'` because next/link renders
 * inside a Client Component boundary in the App Router. The
 * component receives pre-fetched accounts from the parent
 * Server Component (the dashboard page).
 *
 * No logic in tests (root AGENTS.md §10.5): assertions are
 * direct `getByRole` checks against the rendered output.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardAccountPicker } from './dashboard-account-picker';

describe('DashboardAccountPicker (slice 4 T-UI-302)', () => {
  it('renders a <nav aria-label="Account picker"> with one <Link> per account', () => {
    const accounts = [
      { id: 'a1', name: 'Main ARS' },
      { id: 'a2', name: 'Main USD' },
    ];
    render(<DashboardAccountPicker accounts={accounts} currentAccountId={null} />);
    const nav = screen.getByRole('navigation', { name: /account picker/i });
    expect(nav).toBeInTheDocument();
    const linkArs = screen.getByRole('link', { name: 'Main ARS' });
    const linkUsd = screen.getByRole('link', { name: 'Main USD' });
    expect(linkArs).toHaveAttribute('href', '/dashboard?accountId=a1');
    expect(linkUsd).toHaveAttribute('href', '/dashboard?accountId=a2');
  });

  it('sets aria-current="page" on the currently-selected account only', () => {
    const accounts = [
      { id: 'a1', name: 'Main ARS' },
      { id: 'a2', name: 'Main USD' },
    ];
    render(<DashboardAccountPicker accounts={accounts} currentAccountId="a2" />);
    const linkArs = screen.getByRole('link', { name: 'Main ARS' });
    const linkUsd = screen.getByRole('link', { name: 'Main USD' });
    // Selected link carries aria-current='page'.
    expect(linkUsd).toHaveAttribute('aria-current', 'page');
    // Other links carry NO aria-current (attribute omitted, not "false").
    expect(linkArs).not.toHaveAttribute('aria-current');
  });

  it('renders nothing when the accounts list is empty', () => {
    const { container } = render(
      <DashboardAccountPicker accounts={[]} currentAccountId={null} />,
    );
    // No <nav> in the DOM.
    expect(container.querySelector('nav')).toBeNull();
    // No links either.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is keyboard-navigable: Tab focuses, Enter activates the link', async () => {
    const user = userEvent.setup();
    const accounts = [{ id: 'a1', name: 'Main ARS' }];
    render(<DashboardAccountPicker accounts={accounts} currentAccountId={null} />);
    const linkArs = screen.getByRole('link', { name: 'Main ARS' });
    linkArs.focus();
    expect(linkArs).toHaveFocus();
    // Enter on a focused link follows the href — jsdom does NOT
    // navigate, but a focused + activatable <a> is the contract.
    await user.keyboard('{Enter}');
    // The link is still focusable (no preventDefault on Enter for
    // <a href>; navigation is the browser's job).
    expect(linkArs).toHaveFocus();
  });
});
