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

import type { TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import { InvalidAccountIdError } from '../errors/invalid-account-id-error';
import { InvalidDateRangeError } from '../errors/invalid-date-range-error';
import { aggregateAccountFlow, type AccountFlowDay } from '../services/aggregate-transactions';

/**
 * Re-export the `AccountFlowDay` shape so downstream consumers
 * (the DTO mapper, the public barrel) import from this
 * aggregate module. The canonical declaration lives in the
 * service layer (`aggregate-transactions.ts`).
 */
export type { AccountFlowDay };

const CUID_RE = /^c[a-z0-9]{20,32}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

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
 * midnight boundaries, then delegates the pure shape derivation
 * to `aggregateAccountFlow` (the service layer).
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

  // The service layer's pure derivation does NOT throw on
  // invalid inputs; it assumes the rows are pre-filtered to
  // the (accountId, date range) by the caller. The factory's
  // input validation above is the boundary.
  const { days, generatedAt } = aggregateAccountFlow(input.rows, input.clock);

  return {
    userId: input.userId,
    accountId: input.accountId,
    fromDate: normalizedFrom,
    toDate: normalizedTo,
    days,
    generatedAt,
  };
}
