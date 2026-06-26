/**
 * Domain aggregate: `CategoryBreakdown`.
 *
 * The per-month, per-(category × currency) rollup. One row per
 * normalized category per `convertedCurrency` present in the
 * user's transactions for the requested UTC month (REQ-RPT-2,
 * BR-RPT-2). The factory delegates the pure shape derivation
 * to the service layer (`aggregateCategoryBreakdown`) and
 * adds the userId / year / month context.
 *
 * Cross-cutting invariants (design §3.3.1):
 * - BR-RPT-2: the raw `category` field is preserved verbatim on
 *   every bucket; the normalized string is derived (lowercase +
 *   trim; null / empty / whitespace-only → "uncategorized").
 * - BR-TX-9: the breakdown's category normalization is the
 *   service layer's job. The factory / action layer never
 *   re-implements the rule.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no FX
 *   call in the read path.
 * - BR-TX-4: the factory trusts the port boundary; it does NOT
 *   re-filter rows by `userId`.
 * - Sort: `amountMinor DESC` primary, `categoryNormalized ASC`
 *   secondary (deterministic tie-break per REQ-RPT-2).
 * - Buckets with `txCount === 0` are excluded.
 */

import type { TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import {
  aggregateCategoryBreakdown,
  type CategoryBucket,
} from '../services/aggregate-transactions';

/**
 * The per-(category × currency) bucket. Re-exported from the
 * service layer's structural shape; downstream consumers
 * (the DTO mapper, the public barrel) import from this
 * aggregate module.
 */
export type { CategoryBucket };

/**
 * The aggregate. `buckets` is sorted by `amountMinor DESC` then
 * `categoryNormalized ASC`. Empty array when no rows.
 */
export interface CategoryBreakdown {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly buckets: readonly CategoryBucket[];
  readonly generatedAt: Date;
}

/**
 * Input to the factory. `rows` is the port's output
 * (`TransactionDTO[]` already filtered by `userId`).
 */
export interface CreateCategoryBreakdownInput {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly rows: readonly TransactionDTO[];
  readonly clock: Clock;
}

/**
 * Build a `CategoryBreakdown` from the port's `TransactionDTO[]`
 * output. Delegates the pure shape derivation to
 * `aggregateCategoryBreakdown` (the service layer); the factory
 * adds userId / year / month context.
 */
export function createCategoryBreakdown(input: CreateCategoryBreakdownInput): CategoryBreakdown {
  const { buckets, generatedAt } = aggregateCategoryBreakdown(input.rows, input.clock);
  return {
    userId: input.userId,
    year: input.year,
    month: input.month,
    buckets,
    generatedAt,
  };
}
