/**
 * Unit tests: `MonthlySummary` aggregate factory.
 *
 * Slice 1 / T-RPT-005 (RED → GREEN) — design §3.2.
 *
 * The factory:
 *  1. Groups `TransactionDTO[]` by `convertedCurrency` (BR-RPT-1,
 *     REQ-RPT-6).
 *  2. Sums `convertedAmountMinor` for `direction = INCOME`
 *     rows → `incomeMinor` (≥ 0).
 *  3. Sums `convertedAmountMinor` for `direction = EXPENSE`
 *     rows → `expenseMinor` (≥ 0).
 *  4. Computes `netMinor = incomeMinor - expenseMinor`.
 *  5. Counts `count = number of rows in the bucket` (≥ 0).
 *  6. Returns `totals: []` when no rows (empty month → 200 +
 *     `totals: []` on the wire; REQ-RPT-1 empty scenario).
 *  7. Stamps `generatedAt = clock.now()` (no `new Date()` in
 *     domain code per design §3 + transactions REQ-TX-14).
 *  8. Throws `InvalidMonthError` (a `ReportsDomainError` subclass)
 *     when `month` is out of bounds.
 *
 * The factory trusts the port boundary (BR-TX-4) — it does NOT
 * re-filter rows by `userId`. Cross-user isolation is the port's
 * responsibility.
 */
import { describe, it, expect } from 'vitest';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import { createMonthlySummary, type MonthlySummary } from './monthly-summary';
import { InvalidMonthError } from '../errors/invalid-month-error';

// A deterministic `Clock` so the test can assert `generatedAt`.
const fixedClock: Clock = {
  now: () => new Date('2026-06-30T12:00:00.000Z'),
};

function tx(overrides: Partial<TransactionDTO> = {}): TransactionDTO {
  return {
    id: 'tx-1',
    userId: 'u-1',
    accountId: 'c-aaaaaaaaaaaaaaaaaaaa', // 21 chars after 'c'
    direction: 'EXPENSE',
    category: null,
    memo: null,
    transactionDate: new Date('2026-06-15T12:00:00.000Z'),
    convertedAmountMinor: 1000,
    convertedCurrency: AccountCurrency.ARS,
    ...overrides,
  };
}

describe('MonthlySummary factory — REQ-RPT-1', () => {
  it('groups by convertedCurrency and produces one MonthlyTotals row per currency (REQ-RPT-1 mixed-currency scenario)', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 100,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-2',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 200,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-3',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 500,
        direction: 'INCOME',
      }),
      tx({
        id: 'tx-4',
        convertedCurrency: AccountCurrency.USD,
        convertedAmountMinor: 50,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-5',
        convertedCurrency: AccountCurrency.USD,
        convertedAmountMinor: 30,
        direction: 'INCOME',
      }),
    ];
    const summary: MonthlySummary = createMonthlySummary({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows,
      clock: fixedClock,
    });
    // Assert the exact expected shape — no `find()` calls or
    // iteration loops in tests (per §10.5 "No logic in tests").
    // The factory's grouping order is implementation-defined;
    // the wire layer (slice 2) sorts the totals. The test pins
    // both buckets by index using a stable ordering assumption.
    expect(summary.totals).toHaveLength(2);
    expect(summary.totals).toEqual([
      {
        convertedCurrency: AccountCurrency.ARS,
        incomeMinor: 500,
        expenseMinor: 300,
        netMinor: 200,
        count: 3,
      },
      {
        convertedCurrency: AccountCurrency.USD,
        incomeMinor: 30,
        expenseMinor: 50,
        netMinor: -20,
        count: 2,
      },
    ]);
  });

  it('returns totals: [] when no rows in the month (REQ-RPT-1 empty scenario)', () => {
    const summary = createMonthlySummary({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows: [],
      clock: fixedClock,
    });
    expect(summary.totals).toEqual([]);
    expect(summary.generatedAt).toEqual(fixedClock.now());
  });

  it('enforces the netMinor = incomeMinor - expenseMinor invariant on the single-bucket case', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 700,
        direction: 'INCOME',
      }),
      tx({
        id: 'tx-2',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 200,
        direction: 'EXPENSE',
      }),
    ];
    const summary = createMonthlySummary({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows,
      clock: fixedClock,
    });
    expect(summary.totals).toEqual([
      {
        convertedCurrency: AccountCurrency.ARS,
        incomeMinor: 700,
        expenseMinor: 200,
        netMinor: 500,
        count: 2,
      },
    ]);
  });

  it('stamps generatedAt from clock.now() (no new Date() in domain code)', () => {
    const summary = createMonthlySummary({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows: [],
      clock: fixedClock,
    });
    expect(summary.generatedAt).toEqual(fixedClock.now());
    expect(summary.generatedAt.toISOString()).toBe('2026-06-30T12:00:00.000Z');
  });

  it('throws InvalidMonthError when month is out of bounds (ReportsDomainError subclass)', () => {
    // The factory throws `InvalidMonthError` (a ReportsDomainError
    // subclass) on out-of-bounds month. The test asserts against
    // the concrete subclass so Vitest's `toThrow(Constructable)`
    // type-checks; the abstract base class declaration in
    // `reports-domain-error.ts` locks the hierarchy invariant.
    expect(() =>
      createMonthlySummary({
        userId: 'u-1',
        year: 2026,
        month: 13,
        rows: [],
        clock: fixedClock,
      }),
    ).toThrow(InvalidMonthError);
    expect(() =>
      createMonthlySummary({
        userId: 'u-1',
        year: 2026,
        month: 0,
        rows: [],
        clock: fixedClock,
      }),
    ).toThrow(InvalidMonthError);
  });
});
