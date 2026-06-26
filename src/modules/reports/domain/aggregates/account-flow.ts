/**
 * Domain aggregate: `AccountFlow`.
 *
 * The per-account daily flow rollup over a date range. One row
 * per UTC calendar day on which the user has at least one
 * transaction in the account within the range (REQ-RPT-3,
 * BR-RPT-3). The factory is the single place that:
 *
 *  1. Validates `accountId` against the cuid regex
 *     `^c[a-z0-9]{20,32}$` (orchestrator correction #1 — NOT
 *     UUID v4 as the spec text originally said; the project
 *     uses cuid for `FinancialAccount.id` per
 *     `openspec/specs/transactions/spec.md:184`).
 *  2. Validates the date range: `fromDate <= toDate` AND
 *     `toDate - fromDate <= 366 days` (BR-RPT-3 codified in the
 *     spec; 366 = one calendar year + leap-day buffer per
 *     orchestrator correction #3).
 *  3. Normalizes `fromDate` to `00:00:00.000Z` UTC and `toDate`
 *     to `23:59:59.999Z` UTC.
 *  4. Groups rows by `(date YYYY-MM-DD UTC, convertedCurrency)`.
 *  5. Sparse days (no rows) are omitted (BR-RPT-3).
 *  6. Computes `runningBalanceMinor` cumulatively:
 *     `days[0].runningBalanceMinor === days[0].netMinor` and
 *     `days[i].runningBalanceMinor === days[i-1].runningBalanceMinor + days[i].netMinor`.
 *  7. Stamps `generatedAt = clock.now()`.
 *
 * Cross-cutting invariants (design §3.4.1):
 * - BR-TX-4: the factory trusts the port to have filtered by
 *   `userId`, `accountId`, and the date range — it does NOT
 *   re-filter.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no FX
 *   call in the read path.
 */

import type { AccountCurrency } from '@/shared/domain-kernel';
import type { TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import { InvalidAccountIdError } from '../errors/invalid-account-id-error';
import { InvalidDateRangeError } from '../errors/invalid-date-range-error';

const CUID_RE = /^c[a-z0-9]{20,32}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

/**
 * The per-day point. `date` is the UTC `YYYY-MM-DD` key (no
 * time component). `netMinor` is the net change for the date
 * only (sign preserved — INCOME positive, EXPENSE negative).
 * `runningBalanceMinor` is the cumulative net up to and
 * including `date`. `count` is the number of transactions on
 * `date` (always `> 0` — sparse days are omitted).
 */
export interface AccountFlowDay {
  readonly date: string;
  readonly netMinor: number;
  readonly runningBalanceMinor: number;
  readonly count: number;
  readonly convertedCurrency: AccountCurrency;
}

/**
 * The aggregate. `days` is sorted by `date` ASC; sparse days
 * omitted.
 */
export interface AccountFlow {
  readonly userId: string;
  readonly accountId: string;
  readonly fromDate: Date;
  readonly toDate: Date;
  readonly days: readonly AccountFlowDay[];
  readonly generatedAt: Date;
}

/**
 * Input to the factory. `rows` is the port's output
 * (`TransactionDTO[]` already filtered by `userId`, `accountId`,
 * and the date range).
 */
export interface CreateAccountFlowInput {
  readonly userId: string;
  readonly accountId: string;
  readonly fromDate: Date;
  readonly toDate: Date;
  readonly rows: readonly TransactionDTO[];
  readonly clock: Clock;
}

/**
 * Build an `AccountFlow` from the port's `TransactionDTO[]`
 * output. Validates the `accountId` (cuid regex) and the date
 * range (366-day upper bound), normalizes the range to UTC
 * midnight boundaries, groups by `(date, convertedCurrency)`,
 * omits sparse days, and computes the cumulative running
 * balance.
 */
export function createAccountFlow(input: CreateAccountFlowInput): AccountFlow {
  // Defense in depth — the action layer's Zod parse is the
  // primary gate; the factory is the secondary.
  if (!CUID_RE.test(input.accountId)) {
    throw new InvalidAccountIdError(
      `accountId must match the cuid regex (^c[a-z0-9]{20,32}$); got ${JSON.stringify(input.accountId)}.`,
    );
  }

  // Normalize the date range to UTC midnight boundaries.
  // fromDate → 00:00:00.000Z; toDate → 23:59:59.999Z. The
  // factory strips any local-time component and re-anchors
  // to UTC (BR-RPT-3, Q4 codifies the UTC midnight rule).
  const fromYear = input.fromDate.getUTCFullYear();
  const fromMonth = input.fromDate.getUTCMonth();
  const fromDay = input.fromDate.getUTCDate();
  const toYear = input.toDate.getUTCFullYear();
  const toMonth = input.toDate.getUTCMonth();
  const toDay = input.toDate.getUTCDate();
  const normalizedFrom = new Date(Date.UTC(fromYear, fromMonth, fromDay, 0, 0, 0, 0));
  const normalizedTo = new Date(Date.UTC(toYear, toMonth, toDay, 23, 59, 59, 999));

  // Date range validation. `fromDate <= toDate` AND
  // `toDate - fromDate <= 366 days` (BR-RPT-3). Compute days
  // inclusive of both endpoints.
  if (normalizedFrom.getTime() > normalizedTo.getTime()) {
    throw new InvalidDateRangeError(
      `fromDate (${normalizedFrom.toISOString()}) must be <= toDate (${normalizedTo.toISOString()}).`,
    );
  }
  const rangeDays =
    Math.floor((normalizedTo.getTime() - normalizedFrom.getTime()) / MS_PER_DAY) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new InvalidDateRangeError(
      `Date range must be <= ${MAX_RANGE_DAYS} days; got ${rangeDays}.`,
    );
  }

  // Group rows by `(YYYY-MM-DD UTC, convertedCurrency)`. The
  // Map's key encodes both fields; the value carries the
  // aggregated state.
  interface DayBucket {
    date: string; // YYYY-MM-DD
    convertedCurrency: AccountCurrency;
    netMinor: number;
    count: number;
  }
  const buckets = new Map<string, DayBucket>();

  for (const row of input.rows) {
    const td = row.transactionDate;
    const dateKey = dateToUtcKey(td);
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

  // Build the days array, sorted by date ASC. Compute the
  // running balance cumulatively per-currency — the
  // `runningByCurrency` map tracks each currency's running
  // balance separately, so the running balance RESETS to that
  // currency's first observation when a new currency appears.
  // v1 assumes a single `convertedCurrency` per account
  // (design §3.4.1 last bullet); cross-currency mixes
  // therefore maintain independent running balances per
  // currency (no cross-currency aggregation).
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // Within the same date, group by currency for stable order.
    return a.convertedCurrency < b.convertedCurrency ? -1 : 1;
  });

  let runningByCurrency = new Map<AccountCurrency, number>();
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
    userId: input.userId,
    accountId: input.accountId,
    fromDate: normalizedFrom,
    toDate: normalizedTo,
    days,
    generatedAt: input.clock.now(),
  };
}

/**
 * Convert a `Date` to a UTC `YYYY-MM-DD` key. Uses the UTC
 * components to anchor the date — the factory's range
 * normalization uses the same UTC components for consistency.
 */
function dateToUtcKey(d: Date): string {
  const year = d.getUTCFullYear().toString().padStart(4, '0');
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
