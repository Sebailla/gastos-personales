/**
 * Domain aggregate: `MonthlySummary`.
 *
 * The per-month, per-currency rollup. One row per `convertedCurrency`
 * present in the user's transactions for the requested UTC month
 * (BR-RPT-1, REQ-RPT-1, REQ-RPT-6). The factory is the single
 * place that builds the aggregate; downstream code consumes the
 * typed `MonthlySummary` through the action layer (slice 2).
 *
 * Cross-cutting invariants (design §3.2.1):
 * - BR-ACC-12: aggregates group by `convertedCurrency` and
 *   never call the FX provider in the read path.
 * - BR-TX-4: the factory trusts the port to have filtered by
 *   `userId`; it does NOT re-filter rows.
 * - The factory calls `clock.now()` for `generatedAt` (no
 *   `new Date()` in domain code, per REQ-TX-14 + design §3).
 * - The factory throws `InvalidMonthError` (a
 *   `ReportsDomainError` subclass) on out-of-bounds month.
 *   Defense in depth: the action layer's Zod parse is the
 *   primary gate.
 *
 * The factory is a free function (not a class) — the canonical
 * pattern across the codebase (mirrors the transactions
 * `create-transaction.ts` factory).
 */

import type { AccountCurrency } from '@/shared/domain-kernel';
import type { TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import { InvalidMonthError } from '../errors/invalid-month-error';

/**
 * The per-currency totals row. `incomeMinor` and `expenseMinor`
 * are always `>= 0`; the sign lives on `netMinor` (which is
 * `incomeMinor - expenseMinor`).
 */
export interface MonthlyTotals {
  readonly convertedCurrency: AccountCurrency;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly netMinor: number;
  readonly count: number;
}

/**
 * The aggregate. `totals` is empty when no rows in the window
 * (REQ-RPT-1 empty scenario). The factory stamps
 * `generatedAt = clock.now()`.
 */
export interface MonthlySummary {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly totals: readonly MonthlyTotals[];
  readonly generatedAt: Date;
}

/**
 * Input to the factory. `rows` is the port's output
 * (`TransactionDTO[]` already filtered by `userId`); the factory
 * trusts the port boundary (BR-TX-4) and does not re-filter.
 */
export interface CreateMonthlySummaryInput {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly rows: readonly TransactionDTO[];
  readonly clock: Clock;
}

const MIN_MONTH = 1;
const MAX_MONTH = 12;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Build a `MonthlySummary` from the port's `TransactionDTO[]`
 * output for the given UTC month. Groups by `convertedCurrency`
 * (BR-RPT-1); one row per currency. The factory stamps
 * `generatedAt = clock.now()` and throws `InvalidMonthError`
 * when `year` / `month` is out of bounds.
 *
 * Iteration order is the natural insertion order of the
 * `convertedCurrency` keys (the order in which the rows are
 * first observed). The wire layer (slice 2) sorts the totals
 * for a stable response; tests that depend on order should
 * pin the exact shape rather than rely on index.
 */
export function createMonthlySummary(input: CreateMonthlySummaryInput): MonthlySummary {
  // Defense in depth — the action layer's Zod parse is the
  // primary gate; the factory is the secondary.
  if (!Number.isInteger(input.month) || input.month < MIN_MONTH || input.month > MAX_MONTH) {
    throw new InvalidMonthError(
      `Month must be an integer in ${MIN_MONTH}..${MAX_MONTH} (got ${input.month}).`,
    );
  }
  if (!Number.isInteger(input.year) || input.year < MIN_YEAR || input.year > MAX_YEAR) {
    throw new InvalidMonthError(
      `Year must be an integer in ${MIN_YEAR}..${MAX_YEAR} (got ${input.year}).`,
    );
  }

  // Group by `convertedCurrency`. The Map's insertion order
  // reflects the order in which currencies are first observed
  // in the input rows; the wire layer (slice 2) sorts for a
  // stable response.
  const buckets = new Map<AccountCurrency, MonthlyTotals>();

  for (const row of input.rows) {
    const existing = buckets.get(row.convertedCurrency);
    const isIncome = row.direction === 'INCOME';
    const isExpense = row.direction === 'EXPENSE';
    if (existing === undefined) {
      // `convertedAmountMinor` is signed (negative for refunds
      // — see REQ-TX-1 + BR-ACC-12). The `incomeMinor` and
      // `expenseMinor` fields are always `>= 0`; `Math.abs`
      // strips the sign so a refund row still counts as an
      // EXPENSE magnitude. The sign lives on `netMinor`
      // (income - expense, can be negative).
      buckets.set(row.convertedCurrency, {
        convertedCurrency: row.convertedCurrency,
        incomeMinor: isIncome ? Math.abs(row.convertedAmountMinor) : 0,
        expenseMinor: isExpense ? Math.abs(row.convertedAmountMinor) : 0,
        netMinor:
          (isIncome ? row.convertedAmountMinor : 0) + (isExpense ? -row.convertedAmountMinor : 0),
        count: 1,
      });
    } else {
      // Compute the next bucket state. We rebuild the
      // MonthlyTotals object immutably (the interface is
      // `readonly`; the Map entry is replaced).
      const incomeMinor =
        existing.incomeMinor + (isIncome ? Math.abs(row.convertedAmountMinor) : 0);
      const expenseMinor =
        existing.expenseMinor + (isExpense ? Math.abs(row.convertedAmountMinor) : 0);
      const netMinor = incomeMinor - expenseMinor;
      const count = existing.count + 1;
      buckets.set(row.convertedCurrency, {
        convertedCurrency: existing.convertedCurrency,
        incomeMinor,
        expenseMinor,
        netMinor,
        count,
      });
    }
  }

  const totals: MonthlyTotals[] = Array.from(buckets.values());

  return {
    userId: input.userId,
    year: input.year,
    month: input.month,
    totals,
    generatedAt: input.clock.now(),
  };
}
