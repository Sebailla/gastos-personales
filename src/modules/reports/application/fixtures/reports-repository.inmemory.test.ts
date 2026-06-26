/**
 * Tests for `InMemoryReportsRepository` (T-RPT-106).
 *
 * Slice 2 deliverable — the in-memory test fixture for the
 * `ReportsRepositoryPort`. The fixture is **injection-based**:
 * it accepts a `TransactionListFn` callback matching the
 * kernel's `TransactionRepositoryPort.list` signature. The
 * tests wire `txRepo.list.bind(txRepo)` from the canonical
 * `InMemoryTransactionRepository` (transactions module);
 * the fixture itself does NOT depend on the transactions
 * module (root AGENTS.md §10.5 "Modules isolated" — option
 * (a) per the GGA review feedback on the prior version).
 *
 * The fixture implements the three read methods of
 * `ReportsRepositoryPort`:
 *
 *   - `findByUserAndMonth(userId, { year, month })` — widens
 *     the UTC month to a `fromDate`/`toDate` window and
 *     delegates to the injected list function.
 *   - `findByUserAndMonthForBreakdown(...)` — same code path
 *     internally (screaming-architecture typed at the use-site).
 *   - `findByUserAccountAndRange(userId, { accountId, fromDate,
 *     toDate })` — delegates to the injected list function
 *     with `accountId` + the date range filter.
 *
 * Cross-cutting invariants:
 * - BR-TX-4: every method takes `userId` first; cross-user
 *   access returns `[]` (the underlying list function
 *   enforces it — the fixture trusts the seam).
 * - Empty range returns `[]` (no rows in window).
 *
 * Tests (T-RPT-106 acceptance criteria):
 *   (1) `findByUserAndMonth` delegates to the injected list function.
 *   (2) Cross-user rows are not returned (trust-the-port contract).
 *   (3) `findByUserAccountAndRange` filters by `accountId` + range.
 *   (4) Empty range returns `[]`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryReportsRepository } from './reports-repository.inmemory';
import { InMemoryTransactionRepository } from '@/modules/transactions/application/fixtures/in-memory-transaction.repository';
import { TransactionDirection } from '@/modules/transactions/domain/entities/transaction';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { Transaction } from '@/modules/transactions/domain/entities/transaction';

function makeJuneRow(
  userId: string,
  accountId: string,
  direction: TransactionDirection,
  amountMinor: number,
  currency: AccountCurrency,
  day: number,
): Transaction {
  const date = new Date(Date.UTC(2026, 5, day, 12, 0, 0, 0));
  return {
    id: `tx_${userId}_${accountId}_${day}`,
    userId,
    accountId,
    direction,
    amountMinor,
    currency,
    memo: null,
    category: null,
    transactionDate: date,
    convertedAmountMinor: direction === TransactionDirection.EXPENSE ? -amountMinor : amountMinor,
    convertedCurrency: currency,
    fxAsOfSnapshot: null,
    casaSnapshot: null,
    createdAt: date,
    updatedAt: date,
  } as unknown as Transaction;
}

describe('InMemoryReportsRepository', () => {
  let txRepo: InMemoryTransactionRepository;
  let reportsRepo: InMemoryReportsRepository;

  beforeEach(() => {
    txRepo = new InMemoryTransactionRepository();
    reportsRepo = new InMemoryReportsRepository(txRepo.list.bind(txRepo));
  });

  it('findByUserAndMonth delegates to the injected list function', async () => {
    txRepo.__testInsertRaw(makeJuneRow('u1', 'a1', TransactionDirection.INCOME, 100000, AccountCurrency.ARS, 5));
    const rows = await reportsRepo.findByUserAndMonth('u1', { year: 2026, month: 6 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe('u1');
    expect(rows[0]?.accountId).toBe('a1');
  });

  it('does not return cross-user rows', async () => {
    txRepo.__testInsertRaw(makeJuneRow('u1', 'a1', TransactionDirection.INCOME, 100000, AccountCurrency.ARS, 5));
    txRepo.__testInsertRaw(makeJuneRow('u2', 'a1', TransactionDirection.INCOME, 999999, AccountCurrency.ARS, 10));
    const rows = await reportsRepo.findByUserAndMonth('u1', { year: 2026, month: 6 });
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.userId === 'u1')).toBe(true);
  });

  it('findByUserAccountAndRange filters by accountId + date range', async () => {
    txRepo.__testInsertRaw(makeJuneRow('u1', 'a1', TransactionDirection.INCOME, 100000, AccountCurrency.ARS, 5));
    txRepo.__testInsertRaw(makeJuneRow('u1', 'a2', TransactionDirection.INCOME, 999999, AccountCurrency.ARS, 10));
    txRepo.__testInsertRaw(makeJuneRow('u1', 'a1', TransactionDirection.INCOME, 50000, AccountCurrency.ARS, 25));
    const rows = await reportsRepo.findByUserAccountAndRange('u1', {
      accountId: 'a1',
      fromDate: new Date(Date.UTC(2026, 5, 1, 0, 0, 0, 0)),
      toDate: new Date(Date.UTC(2026, 5, 7, 23, 59, 59, 999)),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.accountId).toBe('a1');
    expect(rows[0]?.id).toBe('tx_u1_a1_5');
  });

  it('returns [] for an empty range', async () => {
    const rows = await reportsRepo.findByUserAccountAndRange('u1', {
      accountId: 'a1',
      fromDate: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0)),
      toDate: new Date(Date.UTC(2026, 0, 1, 23, 59, 59, 999)),
    });
    expect(rows).toEqual([]);
  });
});
