/**
 * Tests for AccountsListTable — slice 2 T-UI-102/T-UI-103.
 *
 * Per design §15.2 the table:
 * (1) renders one row per account sorted by name ASC by default;
 * (2) clicking the Name sort header reverses the sort;
 * (3) clicking the Last activity header sorts by `lastActivityAt`;
 * (4) toggling `Show archived` reveals archived accounts;
 * (5) the empty list renders `EmptyState`;
 * (6) the `Last activity` column shows `—` when `lastActivityAt` is null.
 *
 * The component is a Client Component (`'use client'`) so it can
 * host the sort + show-archived state. RTL's `render` runs in
 * jsdom (per the per-glob `environmentMatchGlobs` in vitest.config.ts).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountsListTable } from './accounts-list-table';
import type { FinancialAccountWire } from '../_lib/account-types';

function makeAccount(overrides: Partial<FinancialAccountWire> = {}): FinancialAccountWire {
  return {
    id: 'acc-1',
    userId: 'user-1',
    type: 'BANK',
    name: 'Main ARS',
    currency: 'ARS',
    openingBalanceMinor: 100000,
    openingBalanceMode: 'FRESH',
    openingBalanceDate: null,
    archivedAt: null,
    bankName: null,
    accountKind: null,
    issuer: null,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    broker: null,
    investmentType: null,
    walletAddress: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AccountsListTable — sort + archived toggle + last activity', () => {
  it('renders one row per account sorted by name ASC by default', () => {
    const accounts = [
      makeAccount({ id: 'a', name: 'Banana' }),
      makeAccount({ id: 'b', name: 'Apple' }),
    ];
    render(<AccountsListTable accounts={accounts} />);
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('Apple')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Banana')).toBeInTheDocument();
  });

  it('clicking the Name sort header reverses the sort', async () => {
    const accounts = [
      makeAccount({ id: 'a', name: 'Apple' }),
      makeAccount({ id: 'b', name: 'Banana' }),
    ];
    const user = userEvent.setup();
    render(<AccountsListTable accounts={accounts} />);
    // Default sort = name ASC. Apple comes first.
    const nameHeader = screen.getByRole('button', { name: 'Name' });
    await user.click(nameHeader);
    // After clicking, sort reverses to DESC: Banana comes first.
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('Banana')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Apple')).toBeInTheDocument();
  });

  it('clicking the Last activity sort header sorts by lastActivityAt', async () => {
    const accounts = [
      makeAccount({
        id: 'old',
        name: 'Old',
        lastActivityAt: '2026-01-01T00:00:00.000Z',
      }),
      makeAccount({
        id: 'new',
        name: 'New',
        lastActivityAt: '2026-06-15T00:00:00.000Z',
      }),
    ];
    const user = userEvent.setup();
    render(<AccountsListTable accounts={accounts} lastActivityIncluded />);
    // Default sort is by name ASC: New then Old (alphabetic).
    // Click "Last activity" to switch the sort key.
    const lastActivityHeader = screen.getByRole('button', { name: 'Last activity' });
    await user.click(lastActivityHeader);
    const rows = screen.getAllByRole('row');
    // After click, sort flips to ASC by lastActivityAt: Old (Jan) before New (Jun).
    expect(within(rows[1]!).getByText('Old')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('New')).toBeInTheDocument();
  });

  it('toggling "Show archived" reveals archived accounts', async () => {
    const accounts = [
      makeAccount({ id: 'active', name: 'Active' }),
      makeAccount({ id: 'archived', name: 'Archived', archivedAt: '2026-05-01T00:00:00.000Z' }),
    ];
    const user = userEvent.setup();
    render(<AccountsListTable accounts={accounts} />);
    // Default = hide archived. Only Active visible.
    let rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // header + 1 data row
    expect(within(rows[1]!).getByText('Active')).toBeInTheDocument();
    // Toggle the "Show archived" checkbox.
    const toggle = screen.getByRole('checkbox', { name: /show archived/i });
    await user.click(toggle);
    rows = screen.getAllByRole('row');
    // Now header + 2 data rows.
    expect(rows).toHaveLength(3);
    // The Archived row renders both the link to /accounts/archived
    // and an "Archived" badge; scope to the row to avoid the
    // duplicate text in the badge.
    const archivedRow = rows[2]!;
    expect(within(archivedRow).getByRole('link', { name: 'Archived' })).toBeInTheDocument();
    expect(within(archivedRow).getByText('Archived', { selector: 'span' })).toBeInTheDocument();
  });

  it('empty list renders an EmptyState', () => {
    render(<AccountsListTable accounts={[]} />);
    // EmptyState renders a <div role="status"> with the title.
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/no accounts/i);
  });

  it('the Last activity column shows "—" when lastActivityAt is null', () => {
    const accounts = [makeAccount({ id: 'a', lastActivityAt: null })];
    render(<AccountsListTable accounts={accounts} lastActivityIncluded />);
    // The em-dash placeholder for a null lastActivityAt.
    const cell = screen.getByText('—');
    expect(cell).toBeInTheDocument();
  });
});
