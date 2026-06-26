/**
 * Pure aggregation service: `aggregate-transactions`.
 *
 * Three free functions that derive the aggregate field shapes
 * from the port's `TransactionDTO[]` output:
 *
 *   - `aggregateMonthly(rows, clock)` → `{ totals, generatedAt }`
 *   - `aggregateCategoryBreakdown(rows, clock)` → `{ buckets, generatedAt }`
 *   - `aggregateAccountFlow(rows, clock)` → `{ days, generatedAt }`
 *
 * The service is the **pure** layer of the aggregates — it
 * derives the totals / buckets / days shapes without
 * user-scoping, year/month anchoring, or date-range validation
 * (those concerns live in the factories at the domain
 * boundary, design §3.5).
 *
 * Cross-module invariants (carried from design §3.6):
 * - BR-TX-4: the service trusts the port boundary; it does NOT
 *   re-filter rows by `userId`. Cross-user isolation is the
 *   port's responsibility.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no FX
 *   call in the read path.
 *
 * The service is zero-I/O. No `new Date()`, no logger, no
 * dispatcher. The action layer (slice 2) wraps the service
 * with user-scoping, error handling, and the dispatcher.
 */

import type { AccountCurrency, TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';

/**
 * Per-currency totals row. Mirrors the `MonthlyTotals` shape
 * from the `MonthlySummary` aggregate.
 */
export interface MonthlyTotals {
  readonly convertedCurrency: AccountCurrency;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly netMinor: number;
  readonly count: number;
}

/**
 * Per-(category × currency) bucket. Mirrors the
 * `CategoryBucket` shape from the `CategoryBreakdown` aggregate.
 */
export interface CategoryBucket {
  readonly category: string | null;
  readonly categoryNormalized: string;
  readonly convertedCurrency: AccountCurrency;
  readonly amountMinor: number;
  readonly txCount: number;
}

/**
 * Per-day flow point. Mirrors the `AccountFlowDay` shape from
 * the `AccountFlow` aggregate.
 */
export interface AccountFlowDay {
  readonly date: string;
  readonly netMinor: number;
  readonly runningBalanceMinor: number;
  readonly count: number;
  readonly convertedCurrency: AccountCurrency;
}

/**
 * Result of `aggregateMonthly`. The factory wraps this with
 * userId / year / month (the caller-side context).
 */
export interface AggregateMonthlyResult {
  readonly totals: readonly MonthlyTotals[];
  readonly generatedAt: Date;
}

/**
 * Result of `aggregateCategoryBreakdown`. Mirrors the field
 * shape of the `CategoryBreakdown` aggregate (without
 * userId / year / month — those live in the factory wrapper).
 */
export interface AggregateCategoryBreakdownResult {
  readonly buckets: readonly CategoryBucket[];
  readonly generatedAt: Date;
}

/**
 * Result of `aggregateAccountFlow`. Mirrors the field shape of
 * the `AccountFlow` aggregate (without userId / accountId /
 * fromDate / toDate — those live in the factory wrapper).
 */
export interface AggregateAccountFlowResult {
  readonly days: readonly AccountFlowDay[];
  readonly generatedAt: Date;
}

// ============================================================================
// Pure aggregation logic. The factories delegate to these
// functions via `aggregateMonthly` / `aggregateCategoryBreakdown` /
// `aggregateAccountFlow` — the factories add userId / year /
// month / accountId / dates context + input validation (cuid
// regex, date range bounds, month bounds). The service is the
// pure shape-derivation layer; the factories are the
// context-validation layer.
// ============================================================================

/**
 * Normalize a raw `category` string. Per BR-TX-9 + BR-RPT-2:
 * `lowercase + trim`; `null` / empty / whitespace-only →
 * `"uncategorized"`. Idempotent.
 */
export function normalizeCategory(category: string | null): string {
  if (category === null) return 'uncategorized';
  const trimmed = category.trim();
  if (trimmed.length === 0) return 'uncategorized';
  return trimmed.toLowerCase();
}

/**
 * Aggregate the rows for a monthly summary. Pure function.
 * Groups by `convertedCurrency`; one row per `convertedCurrency`.
 * Income and expense magnitudes are absolute (`Math.abs`); the
 * sign lives on `netMinor` (income - expense, may be negative).
 */
export function aggregateMonthly(
  rows: readonly TransactionDTO[],
  clock: Clock,
): AggregateMonthlyResult {
  const buckets = new Map<AccountCurrency, MonthlyTotals>();

  for (const row of rows) {
    const isIncome = row.direction === 'INCOME';
    const isExpense = row.direction === 'EXPENSE';
    const existing = buckets.get(row.convertedCurrency);
    if (existing === undefined) {
      const incomeMinor = isIncome ? Math.abs(row.convertedAmountMinor) : 0;
      const expenseMinor = isExpense ? Math.abs(row.convertedAmountMinor) : 0;
      buckets.set(row.convertedCurrency, {
        convertedCurrency: row.convertedCurrency,
        incomeMinor,
        expenseMinor,
        netMinor: incomeMinor - expenseMinor,
        count: 1,
      });
    } else {
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

  return {
    totals: Array.from(buckets.values()),
    generatedAt: clock.now(),
  };
}

/**
 * Aggregate the rows for a category breakdown. Groups by the
 * tuple `(categoryNormalized, convertedCurrency)`; sorts by
 * `amountMinor DESC` then `categoryNormalized ASC`. Zero-count
 * buckets are excluded.
 */
export function aggregateCategoryBreakdown(
  rows: readonly TransactionDTO[],
  clock: Clock,
): AggregateCategoryBreakdownResult {
  const buckets = new Map<string, CategoryBucket>();

  for (const row of rows) {
    const categoryNormalized = normalizeCategory(row.category);
    const k = `${categoryNormalized}|${row.convertedCurrency}`;
    const existing = buckets.get(k);
    if (existing === undefined) {
      buckets.set(k, {
        category: row.category,
        categoryNormalized,
        convertedCurrency: row.convertedCurrency,
        amountMinor: row.convertedAmountMinor,
        txCount: 1,
      });
    } else {
      buckets.set(k, {
        category: existing.category,
        categoryNormalized: existing.categoryNormalized,
        convertedCurrency: existing.convertedCurrency,
        amountMinor: existing.amountMinor + row.convertedAmountMinor,
        txCount: existing.txCount + 1,
      });
    }
  }

  // Sort: `amountMinor DESC` primary, `categoryNormalized ASC`
  // secondary (deterministic tie-break per REQ-RPT-2). The
  // tie-break on `categoryNormalized` alone is sufficient for
  // a single-currency case; for cross-currency ties, the
  // `amountMinor` primary sort already separates the buckets
  // (different currencies with identical amounts are rare).
  const allBuckets = Array.from(buckets.values()).sort((a, b) => {
    if (a.amountMinor !== b.amountMinor) {
      return b.amountMinor - a.amountMinor;
    }
    if (a.categoryNormalized < b.categoryNormalized) return -1;
    if (a.categoryNormalized > b.categoryNormalized) return 1;
    return 0;
  });

  return {
    buckets: allBuckets,
    generatedAt: clock.now(),
  };
}

/**
 * Aggregate the rows for an account flow. Groups by
 * `(date YYYY-MM-DD UTC, convertedCurrency)`; sparse days
 * omitted; running balance computed in date order per
 * `convertedCurrency`.
 *
 * NOTE: the service signature does NOT carry `accountId`,
 * `fromDate`, or `toDate` — those are caller-side context.
 * The service derives the field shape assuming the rows are
 * pre-filtered by the caller (the factory's input validation
 * layer). The service does NOT throw — invalid inputs would
 * produce garbage aggregation, not an exception.
 */
export function aggregateAccountFlow(
  rows: readonly TransactionDTO[],
  clock: Clock,
): AggregateAccountFlowResult {
  interface DayBucket {
    date: string;
    convertedCurrency: AccountCurrency;
    netMinor: number;
    count: number;
  }
  const buckets = new Map<string, DayBucket>();

  for (const row of rows) {
    const td = row.transactionDate;
    const year = td.getUTCFullYear().toString().padStart(4, '0');
    const month = (td.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = td.getUTCDate().toString().padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    const k = `${dateKey}|${row.convertedCurrency}`;
    const existing = buckets.get(k);
    if (existing === undefined) {
      buckets.set(k, {
        date: dateKey,
        convertedCurrency: row.convertedCurrency,
        netMinor: row.convertedAmountMinor,
        count: 1,
      });
    } else {
      existing.netMinor += row.convertedAmountMinor;
      existing.count += 1;
    }
  }

  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.convertedCurrency < b.convertedCurrency ? -1 : 1;
  });

  const runningByCurrency = new Map<AccountCurrency, number>();
  const days: AccountFlowDay[] = sortedBuckets.map((b) => {
    const prev = runningByCurrency.get(b.convertedCurrency) ?? 0;
    const next = prev + b.netMinor;
    runningByCurrency.set(b.convertedCurrency, next);
    return {
      date: b.date,
      netMinor: b.netMinor,
      runningBalanceMinor: next,
      count: b.count,
      convertedCurrency: b.convertedCurrency,
    };
  });

  return {
    days,
    generatedAt: clock.now(),
  };
}
