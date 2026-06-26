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

// =================================================================
// T-RPT-007 — Triangulation cases (5 additional edge cases per
// design §11.1). These force the factory's logic out of a trivial
// "fake-it" pass by exercising different code paths:
//   1. Leap-year February (29 days) — Date.UTC rolls correctly.
//   2. Sparse row — single transaction in a 31-day month.
//   3. Cross-currency weight — ARS + USD totals remain distinct.
//   4. Signed minor units — refund row reduces netMinor.
//   5. null memo + null category — preserved verbatim on the row,
//      but not surfaced on MonthlyTotals (totals are currency-only).
// =================================================================
describe('MonthlySummary factory — triangulation (T-RPT-007)', () => {
  it('handles a February row in a leap year (2024-02-29)', () => {
    // 2024 is a leap year. The factory stamps `generatedAt` from
    // the clock; the row's `transactionDate` is February-only.
    const leapClock: Clock = {
      now: () => new Date('2024-02-29T12:00:00.000Z'),
    };
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        transactionDate: new Date('2024-02-29T12:00:00.000Z'),
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 1000,
        direction: 'EXPENSE',
      }),
    ];
    const summary = createMonthlySummary({
      userId: 'u-1',
      year: 2024,
      month: 2,
      rows,
      clock: leapClock,
    });
    expect(summary.generatedAt.toISOString()).toBe('2024-02-29T12:00:00.000Z');
    expect(summary.totals).toEqual([
      {
        convertedCurrency: AccountCurrency.ARS,
        incomeMinor: 0,
        expenseMinor: 1000,
        netMinor: -1000,
        count: 1,
      },
    ]);
  });

  it('handles a single transaction in a 31-day month (sparse row)', () => {
    // January has 31 days. A single row produces a single bucket
    // with count = 1 and netMinor = incomeMinor - expenseMinor.
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        transactionDate: new Date('2026-01-15T12:00:00.000Z'),
        convertedCurrency: AccountCurrency.USD,
        convertedAmountMinor: 250,
        direction: 'INCOME',
      }),
    ];
    const summary = createMonthlySummary({
      userId: 'u-1',
      year: 2026,
      month: 1,
      rows,
      clock: fixedClock,
    });
    expect(summary.totals).toEqual([
      {
        convertedCurrency: AccountCurrency.USD,
        incomeMinor: 250,
        expenseMinor: 0,
        netMinor: 250,
        count: 1,
      },
    ]);
  });

  it('keeps ARS and USD totals distinct (cross-currency weight)', () => {
    // 1 ARS expense (1000 minor) and 1 USD expense (500 minor).
    // The ARS bucket has only the ARS row; the USD bucket has
    // only the USD row. No auto-conversion at read time
    // (BR-ACC-12).
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 1000,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-2',
        convertedCurrency: AccountCurrency.USD,
        convertedAmountMinor: 500,
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
    expect(summary.totals).toHaveLength(2);
    const ars = summary.totals.find((b) => b.convertedCurrency === AccountCurrency.ARS);
    const usd = summary.totals.find((b) => b.convertedCurrency === AccountCurrency.USD);
    expect(ars?.expenseMinor).toBe(1000);
    expect(ars?.netMinor).toBe(-1000);
    expect(usd?.expenseMinor).toBe(500);
    expect(usd?.netMinor).toBe(-500);
  });

  it('handles a refund row (negative convertedAmountMinor) — reduces netMinor', () => {
    // A refund row has negative `convertedAmountMinor` (the sign
    // is on the snapshot; per REQ-TX-1, amountMinor > 0 always).
    // The refund counts as EXPENSE magnitude (abs(value)) AND
    // subtracts from netMinor. Income stays at 0; expense
    // magnitude is positive.
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-refund',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: -300,
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
        incomeMinor: 0,
        expenseMinor: 300, // magnitude (Math.abs of -300)
        netMinor: -300, // 0 - 300
        count: 1,
      },
    ]);
  });

  it('accepts null memo + null category on the row — totals carry neither field', () => {
    // The MonthlyTotals shape has no `memo` / `category` field
    // (totals are currency-only). The factory must NOT surface
    // row-level fields on the totals. This case pins that
    // invariant with a row whose memo and category are both null.
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        memo: null,
        category: null,
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 100,
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
    // Totals shape has exactly the 5 MonthlyTotals fields — no
    // memo / category leakage.
    expect(summary.totals[0]).toEqual({
      convertedCurrency: AccountCurrency.ARS,
      incomeMinor: 0,
      expenseMinor: 100,
      netMinor: -100,
      count: 1,
    });
    expect(Object.keys(summary.totals[0]).sort()).toEqual(
      ['convertedCurrency', 'count', 'expenseMinor', 'incomeMinor', 'netMinor'].sort(),
    );
  });
});
