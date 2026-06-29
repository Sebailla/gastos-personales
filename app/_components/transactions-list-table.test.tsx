// @vitest-environment jsdom
/**
 * Tests for TransactionsListTable — slice 3 T-UI-202 / T-UI-203.
 *
 * Per design §15.3 the table:
 * (1) renders one row per transaction sorted by transactionDate
 *     DESC by default (newest first);
 * (2) clicking the Date sort header reverses the sort;
 * (3) clicking the Native amount sort header sorts numerically;
 * (4) INCOME direction renders Badge variant="success";
 * (5) EXPENSE direction renders Badge variant="danger";
 * (6) the accountName column renders when the row carries an
 *     `accountName` field (BR-UI-2: the OPTIONAL
 *     `?include=accountName` query flag on /api/transactions);
 * (7) when `accountName` is absent on every row, the column
 *     is hidden entirely;
 * (8) when `nextCursor` is provided, the Pagination primitive
 *     mounts a `Next page` Link.
 *
 * The component is a Client Component (`'use client'`) so it
 * can host the sort state. RTL's `render` runs in jsdom (per
 * the per-glob `environmentMatchGlobs` in vitest.config.ts).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionsListTable } from './transactions-list-table';
import type { TransactionWire } from '../_lib/transaction-types';

function makeTx(overrides: Partial<TransactionWire> = {}): TransactionWire {
  return {
    id: 'tx-1',
    userId: 'user-1',
    accountId: 'acc-1',
    direction: 'EXPENSE',
    amountMinor: 10000,
    currency: 'ARS',
    memo: null,
    category: null,
    transactionDate: '2026-06-15T00:00:00.000Z',
    convertedAmountMinor: 1000,
    convertedCurrency: 'USD',
    fxAsOfSnapshot: '2026-06-15T00:00:00.000Z',
    casaSnapshot: null,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('TransactionsListTable — sort', () => {
  it('renders one row per transaction sorted by transactionDate DESC by default', () => {
    const txs = [
      makeTx({ id: 'old', transactionDate: '2026-01-01T00:00:00.000Z' }),
      makeTx({ id: 'new', transactionDate: '2026-06-15T00:00:00.000Z' }),
    ];
    render(<TransactionsListTable transactions={txs} nextCursor={null} />);
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows.
    expect(rows).toHaveLength(3);
    // Newest first: 'new' before 'old'.
    expect(within(rows[1]!).getByText('new')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('old')).toBeInTheDocument();
  });

  it('clicking the Date sort header reverses the sort', async () => {
    const txs = [
      makeTx({ id: 'old', transactionDate: '2026-01-01T00:00:00.000Z' }),
      makeTx({ id: 'new', transactionDate: '2026-06-15T00:00:00.000Z' }),
    ];
    const user = userEvent.setup();
    render(<TransactionsListTable transactions={txs} nextCursor={null} />);
    const dateHeader = screen.getByRole('button', { name: /^date$/i });
    await user.click(dateHeader);
    const rows = screen.getAllByRole('row');
    // After click, sort flips to ASC: old before new.
    expect(within(rows[1]!).getByText('old')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('new')).toBeInTheDocument();
  });

  it('clicking the Native amount sort header sorts numerically', async () => {
    const txs = [
      makeTx({ id: 'a', amountMinor: 50000, transactionDate: '2026-06-10T00:00:00.000Z' }),
      makeTx({ id: 'b', amountMinor: 1000, transactionDate: '2026-06-11T00:00:00.000Z' }),
      makeTx({ id: 'c', amountMinor: 9999, transactionDate: '2026-06-12T00:00:00.000Z' }),
    ];
    const user = userEvent.setup();
    render(<TransactionsListTable transactions={txs} nextCursor={null} />);
    const amountHeader = screen.getByRole('button', { name: /native amount/i });
    await user.click(amountHeader);
    const rows = screen.getAllByRole('row');
    // After click, sort flips to ASC by amountMinor: b (1000) then c (9999) then a (50000).
    expect(within(rows[1]!).getByText('b')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('c')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('a')).toBeInTheDocument();
  });
});

describe('TransactionsListTable — direction badges (design §3.2.6)', () => {
  it('INCOME direction renders as a Badge variant="success"', () => {
    const txs = [makeTx({ id: 'income', direction: 'INCOME' })];
    render(<TransactionsListTable transactions={txs} nextCursor={null} />);
    // The badge text mirrors the direction literal; check the class
    // through the badge element's class attribute (`bg-ui-success`).
    const badge = screen.getByText('INCOME').closest('span');
    expect(badge).not.toBeNull();
    expect(badge?.className).toMatch(/bg-ui-success/);
  });

  it('EXPENSE direction renders as a Badge variant="danger"', () => {
    const txs = [makeTx({ id: 'expense', direction: 'EXPENSE' })];
    render(<TransactionsListTable transactions={txs} nextCursor={null} />);
    const badge = screen.getByText('EXPENSE').closest('span');
    expect(badge).not.toBeNull();
    expect(badge?.className).toMatch(/bg-ui-danger/);
  });
});

describe('TransactionsListTable — accountName column (BR-UI-2 / include=accountName)', () => {
  it('renders the Account column when accountNameIncluded=true AND rows carry accountName', () => {
    const txs = [
      makeTx({ id: 'a', accountId: 'acc-1', accountName: 'Main ARS' }),
      makeTx({ id: 'b', accountId: 'acc-2', accountName: 'Brokerage USD' }),
    ];
    render(
      <TransactionsListTable
        transactions={txs}
        nextCursor={null}
        accountNameIncluded
      />,
    );
    // The column header is rendered.
    expect(screen.getByText('Account')).toBeInTheDocument();
    // Both account names surface in the data rows.
    expect(screen.getByText('Main ARS')).toBeInTheDocument();
    expect(screen.getByText('Brokerage USD')).toBeInTheDocument();
  });

  it('hides the Account column when accountNameIncluded=false (default)', () => {
    const txs = [makeTx({ id: 'a', accountName: 'Should not appear' })];
    render(<TransactionsListTable transactions={txs} nextCursor={null} />);
    // The column header is absent.
    expect(screen.queryByRole('columnheader', { name: 'Account' })).toBeNull();
    expect(screen.queryByText('Should not appear')).toBeNull();
  });
});

describe('TransactionsListTable — pagination', () => {
  it('renders a Next page Link when nextCursor is provided', () => {
    const txs = [makeTx({ id: 'tx-1' })];
    render(
      <TransactionsListTable
        transactions={txs}
        nextCursor="cursor-1"
      />,
    );
    // Pagination primitive renders a <nav aria-label="Pagination">
    // with a "Next page" Link (per design §15.3).
    const nav = screen.getByRole('navigation', { name: /pagination/i });
    expect(nav).toBeInTheDocument();
    const nextLink = within(nav).getByRole('link', { name: /next page/i });
    expect(nextLink).toBeInTheDocument();
    expect(nextLink.getAttribute('href')).toBe('?cursor=cursor-1');
  });

  it('does not render the Pagination navigation when nextCursor is null', () => {
    const txs = [makeTx({ id: 'tx-1' })];
    render(<TransactionsListTable transactions={txs} nextCursor={null} />);
    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull();
  });
});

describe('TransactionsListTable — empty state', () => {
  it('renders an EmptyState primitive when transactions is empty', () => {
    render(<TransactionsListTable transactions={[]} nextCursor={null} />);
    // EmptyState renders a <div role="status"> with the title.
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/no transactions/i);
  });
});
