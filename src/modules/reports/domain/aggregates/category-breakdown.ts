/**
 * Domain aggregate: `CategoryBreakdown`.
 *
 * The per-month, per-(category × currency) rollup. One row per
 * normalized category per `convertedCurrency` present in the
 * user's transactions for the requested UTC month (REQ-RPT-2,
 * BR-RPT-2). The factory is the single place that normalizes
 * the raw `category` string and groups by the tuple
 * `(categoryNormalized, convertedCurrency)`.
 *
 * Cross-cutting invariants (design §3.3.1):
 * - BR-RPT-2: the raw `category` field is preserved verbatim on
 *   every bucket; the normalized string is derived (lowercase +
 *   trim; null / empty / whitespace-only → "uncategorized").
 * - BR-TX-9: the breakdown's category normalization is the
 *   factory's job. The action layer never re-implements the rule.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no FX
 *   call in the read path.
 * - BR-TX-4: the factory trusts the port boundary; it does NOT
 *   re-filter rows by `userId`.
 * - Sort: `amountMinor DESC` primary, `categoryNormalized ASC`
 *   secondary (deterministic tie-break per REQ-RPT-2).
 * - Buckets with `txCount === 0` are excluded.
 */

import type { AccountCurrency } from '@/shared/domain-kernel';
import type { TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';

/**
 * The bucket key. Two-row groups: `(categoryNormalized,
 * convertedCurrency)`. The factory uses a `Map` with this key
 * shape for O(1) lookup.
 */
interface BucketKey {
  readonly categoryNormalized: string;
  readonly convertedCurrency: AccountCurrency;
}

function keyOf(k: BucketKey): string {
  // Deterministic key encoding. Avoids object-as-Map-key overhead.
  return `${k.categoryNormalized}|${k.convertedCurrency}`;
}

/**
 * Normalize a raw `category` string. Per BR-TX-9 + BR-RPT-2:
 * `lowercase + trim`; `null` / empty / whitespace-only →
 * `"uncategorized"`. The function is idempotent: calling it
 * twice on the same input yields the same output.
 *
 * Free function (no class, no side effects). Exported so the
 * action layer (slice 2) can use it for DTO mapping and the test
 * suite can assert the contract directly.
 */
export function normalizeCategory(category: string | null): string {
  if (category === null) return 'uncategorized';
  const trimmed = category.trim();
  if (trimmed.length === 0) return 'uncategorized';
  return trimmed.toLowerCase();
}

/**
 * The per-(category × currency) bucket. `category` is the FIRST
 * raw string observed for the bucket; subsequent raw strings
 * are dropped (BR-RPT-2 accepts any raw value, first wins).
 * `categoryNormalized` is the lowercase + trim of `category`
 * (null/empty → "uncategorized").
 */
export interface CategoryBucket {
  readonly category: string | null;
  readonly categoryNormalized: string;
  readonly convertedCurrency: AccountCurrency;
  readonly amountMinor: number;
  readonly txCount: number;
}

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
 * output. Normalizes each row's `category` via
 * `normalizeCategory`, groups by `(categoryNormalized,
 * convertedCurrency)`, sums `convertedAmountMinor` per bucket,
 * sorts deterministically, and stamps `generatedAt =
 * clock.now()`.
 *
 * Per-row sign: `convertedAmountMinor` is signed (negative for
 * refunds per REQ-TX-1 + BR-ACC-12). The factory does NOT take
 * `Math.abs` here — `amountMinor` carries the sign so a refund
 * row produces a negative bucket amount (the consumer can
 * interpret negative as "net outflow reduction"). This differs
 * from the MonthlySummary factory (where `incomeMinor` /
 * `expenseMinor` are always `>= 0`).
 */
export function createCategoryBreakdown(input: CreateCategoryBreakdownInput): CategoryBreakdown {
  // Group by `(categoryNormalized, convertedCurrency)`. The
  // Map's key encodes both fields; the value carries the
  // aggregated state plus the first-observed raw `category`.
  const buckets = new Map<
    string,
    {
      bucket: CategoryBucket;
    }
  >();

  for (const row of input.rows) {
    const categoryNormalized = normalizeCategory(row.category);
    const k = keyOf({
      categoryNormalized,
      convertedCurrency: row.convertedCurrency,
    });
    const existing = buckets.get(k);
    if (existing === undefined) {
      // First row for this bucket — preserve the raw category.
      buckets.set(k, {
        bucket: {
          category: row.category,
          categoryNormalized,
          convertedCurrency: row.convertedCurrency,
          amountMinor: row.convertedAmountMinor,
          txCount: 1,
        },
      });
    } else {
      // Subsequent row — keep the first raw category (BR-RPT-2).
      const next: CategoryBucket = {
        category: existing.bucket.category,
        categoryNormalized: existing.bucket.categoryNormalized,
        convertedCurrency: existing.bucket.convertedCurrency,
        amountMinor: existing.bucket.amountMinor + row.convertedAmountMinor,
        txCount: existing.bucket.txCount + 1,
      };
      buckets.set(k, { bucket: next });
    }
  }

  // Drop zero-count buckets (defensive — the factory never
  // produces them via the loop above, but the invariant is
  // locked at the type level for downstream consumers).
  const allBuckets = Array.from(buckets.values())
    .map((entry) => entry.bucket)
    .filter((b) => b.txCount > 0);

  // Sort: `amountMinor DESC` primary, `categoryNormalized ASC`
  // secondary (deterministic tie-break per REQ-RPT-2).
  allBuckets.sort((a, b) => {
    if (a.amountMinor !== b.amountMinor) {
      return b.amountMinor - a.amountMinor; // DESC
    }
    if (a.categoryNormalized < b.categoryNormalized) return -1;
    if (a.categoryNormalized > b.categoryNormalized) return 1;
    return 0;
  });

  return {
    userId: input.userId,
    year: input.year,
    month: input.month,
    buckets: allBuckets,
    generatedAt: input.clock.now(),
  };
}
