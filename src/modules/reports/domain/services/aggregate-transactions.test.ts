/**
 * Unit tests: `aggregate-transactions` pure service.
 *
 * Slice 1 / T-RPT-010 — the service is the pure derivation
 * layer (zero I/O) consumed by the aggregate factories and
 * the action layer (slice 2). The cross-user-isolation
 * contract is exercised here: the service trusts the port
 * boundary (BR-TX-4) — it does NOT re-filter rows by
 * `userId`. Cross-user isolation is the port's responsibility.
 *
 * The test asserts:
 *  1. `aggregateMonthly` groups by `convertedCurrency` and
 *     computes the totals correctly.
 *  2. `aggregateCategoryBreakdown` normalizes + groups +
 *     sorts.
 *  3. `aggregateAccountFlow` groups by UTC day + computes
 *     the running balance cumulatively.
 *  4. Cross-user rows in the input pass through the
 *     aggregator unchanged — the service trusts the port to
 *     have already filtered them out. The trust contract is
 *     tested here (the integration test in slice 2 verifies
 *     the full port-level filter).
 *  5. `normalizeCategory` lowercases + trims; null/empty →
 *     "uncategorized"; idempotent.
 */
import { describe, it, expect } from 'vitest';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import {
  aggregateMonthly,
  aggregateCategoryBreakdown,
  aggregateAccountFlow,
  normalizeCategory,
} from './aggregate-transactions';

const fixedClock: Clock = {
  now: () => new Date('2026-06-30T12:00:00.000Z'),
};

function tx(overrides: Partial<TransactionDTO> = {}): TransactionDTO {
  return {
    id: 'tx-1',
    userId: 'u-1',
    accountId: 'caaaaaaaaaaaaaaaaaaaa',
    direction: 'INCOME',
    category: null,
    memo: null,
    transactionDate: new Date('2026-06-15T12:00:00.000Z'),
    convertedAmountMinor: 1000,
    convertedCurrency: AccountCurrency.ARS,
    ...overrides,
  };
}

describe('aggregateMonthly — pure derivation', () => {
  it('groups by convertedCurrency and computes the totals correctly', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 500,
        direction: 'INCOME',
      }),
      tx({
        id: 'tx-2',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 300,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-3',
        convertedCurrency: AccountCurrency.USD,
        convertedAmountMinor: 100,
        direction: 'EXPENSE',
      }),
    ];
    const result = aggregateMonthly(rows, fixedClock);
    expect(result.generatedAt).toEqual(fixedClock.now());
    expect(result.totals).toEqual([
      {
        convertedCurrency: AccountCurrency.ARS,
        incomeMinor: 500,
        expenseMinor: 300,
        netMinor: 200,
        count: 2,
      },
      {
        convertedCurrency: AccountCurrency.USD,
        incomeMinor: 0,
        expenseMinor: 100,
        netMinor: -100,
        count: 1,
      },
    ]);
  });

  it('passes cross-user rows through unchanged (trust-the-port contract, BR-TX-4)', () => {
    // The service does NOT re-filter by userId. Cross-user
    // rows are the caller's responsibility to filter out.
    // The aggregator sums them like any other row.
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        userId: 'u-1',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 100,
      }),
      tx({
        id: 'tx-2',
        userId: 'u-2',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 200,
      }),
    ];
    const result = aggregateMonthly(rows, fixedClock);
    // Both rows contribute to the bucket — the service does
    // NOT know about user boundaries.
    const ars = result.totals.find((t) => t.convertedCurrency === AccountCurrency.ARS);
    expect(ars?.count).toBe(2);
    expect(ars?.incomeMinor).toBe(300);
  });

  it('returns totals: [] when no rows', () => {
    const result = aggregateMonthly([], fixedClock);
    expect(result.totals).toEqual([]);
    expect(result.generatedAt).toEqual(fixedClock.now());
  });
});

describe('aggregateCategoryBreakdown — pure derivation', () => {
  it('normalizes category and groups by (categoryNormalized, convertedCurrency)', () => {
    const rows: readonly TransactionDTO[] = [
      tx({ id: 'tx-1', category: 'Food', convertedAmountMinor: 100 }),
      tx({ id: 'tx-2', category: 'food', convertedAmountMinor: 200 }),
      tx({ id: 'tx-3', category: '  FOOD  ', convertedAmountMinor: 300 }),
    ];
    const result = aggregateCategoryBreakdown(rows, fixedClock);
    expect(result.buckets).toEqual([
      {
        category: 'Food',
        categoryNormalized: 'food',
        convertedCurrency: AccountCurrency.ARS,
        amountMinor: 600,
        txCount: 3,
      },
    ]);
  });

  it('sorts by amountMinor DESC primary, categoryNormalized ASC secondary', () => {
    const rows: readonly TransactionDTO[] = [
      tx({ id: 'tx-1', category: 'Food', convertedAmountMinor: 100 }),
      tx({ id: 'tx-2', category: 'Rent', convertedAmountMinor: 300 }),
      tx({ id: 'tx-3', category: 'Other', convertedAmountMinor: 50 }),
    ];
    const result = aggregateCategoryBreakdown(rows, fixedClock);
    expect(result.buckets.map((b) => b.categoryNormalized)).toEqual(['rent', 'food', 'other']);
  });
});

describe('aggregateAccountFlow — pure derivation', () => {
  it('groups by UTC day and computes the running balance cumulatively', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        transactionDate: new Date('2026-06-01T12:00:00.000Z'),
        convertedAmountMinor: 100,
      }),
      tx({
        id: 'tx-2',
        transactionDate: new Date('2026-06-02T12:00:00.000Z'),
        convertedAmountMinor: -200,
      }),
      tx({
        id: 'tx-3',
        transactionDate: new Date('2026-06-03T12:00:00.000Z'),
        convertedAmountMinor: 50,
      }),
    ];
    const result = aggregateAccountFlow(rows, fixedClock);
    expect(result.days).toEqual([
      {
        date: '2026-06-01',
        netMinor: 100,
        runningBalanceMinor: 100,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
      {
        date: '2026-06-02',
        netMinor: -200,
        runningBalanceMinor: -100,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
      {
        date: '2026-06-03',
        netMinor: 50,
        runningBalanceMinor: -50,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
    ]);
  });

  it('omits sparse days (no entries for days without rows)', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        transactionDate: new Date('2026-06-01T12:00:00.000Z'),
        convertedAmountMinor: 100,
      }),
      tx({
        id: 'tx-3',
        transactionDate: new Date('2026-06-03T12:00:00.000Z'),
        convertedAmountMinor: 200,
      }),
    ];
    const result = aggregateAccountFlow(rows, fixedClock);
    expect(result.days).toHaveLength(2);
    expect(result.days.map((d) => d.date)).not.toContain('2026-06-02');
  });
});

describe('normalizeCategory — service-layer free function', () => {
  it('lowercases + trims a raw category', () => {
    expect(normalizeCategory('Food')).toBe('food');
    expect(normalizeCategory('  FOOD  ')).toBe('food');
  });

  it('returns "uncategorized" for null / empty / whitespace-only', () => {
    expect(normalizeCategory(null)).toBe('uncategorized');
    expect(normalizeCategory('')).toBe('uncategorized');
    expect(normalizeCategory('   ')).toBe('uncategorized');
  });

  it('is idempotent', () => {
    expect(normalizeCategory(normalizeCategory('FOO'))).toBe('foo');
    expect(normalizeCategory(normalizeCategory(null))).toBe('uncategorized');
  });
});
