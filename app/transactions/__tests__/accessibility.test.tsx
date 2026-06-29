// @vitest-environment jsdom
/**
 * Axe-core a11y contract for the transactions surface — slice 3 chore(test).
 *
 * Verifies that the production Client Component renders for the
 * transactions surface produce ZERO `critical` axe-core
 * violations. The `vitest-axe` matcher is registered globally
 * in `test/axe-setup.ts`. `serious` violations are logged but not
 * blocking the gate (slice 5 widens the gate to `serious`).
 *
 * The full-page axe-core suite (which exercises the actual
 * Server Components through the Next dev server) lands in
 * slice 5 (`feat/ui-integration-tests`).
 *
 * This file covers only the TransactionsListTable Client
 * Component (the largest a11y surface in the slice). The
 * per-form axe assertions are exercised in each form's
 * dedicated `.test.tsx` file (e.g.
 * `create-transaction-form.test.tsx`) and the full Server
 * Component pages land in slice 5.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TransactionsListTable } from '../../_components/transactions-list-table';
import type { TransactionWire } from '../../_lib/transaction-types';

function makeTx(overrides: Partial<TransactionWire> = {}): TransactionWire {
  return {
    id: 'tx-1',
    userId: 'user-1',
    accountId: 'acc-1',
    direction: 'INCOME',
    amountMinor: 1000,
    currency: 'USD',
    memo: 'Test memo',
    category: 'salary',
    transactionDate: '2026-06-15T00:00:00.000Z',
    convertedAmountMinor: 1000,
    convertedCurrency: 'USD',
    fxAsOfSnapshot: '2026-06-15T12:00:00.000Z',
    casaSnapshot: null,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    accountName: 'Brokerage USD',
    ...overrides,
  };
}

describe('transactions surface — axe-core a11y contract (critical only)', () => {
  it('TransactionsListTable has no critical axe violations', async () => {
    const { container } = render(
      <TransactionsListTable
        transactions={[
          makeTx({ id: 'a', accountName: 'Main ARS' }),
          makeTx({ id: 'b', direction: 'EXPENSE', amountMinor: 500 }),
        ]}
        nextCursor="cursor-1"
        accountNameIncluded
      />,
    );
    const results = await axe(container);
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
