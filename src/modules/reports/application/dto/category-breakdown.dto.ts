/**
 * DTOs for `CategoryBreakdown`.
 *
 * Slice 2 deliverable — wire shape returned by
 * `GET /api/reports/breakdown`. The mapper is mechanical
 * (design §5.7):
 *
 *   - `Date` fields (`generatedAt`) → ISO-8601 string.
 *   - `null` `category` is preserved verbatim (the raw
 *     string from the `Transaction` row, per BR-RPT-2).
 *   - `categoryNormalized` is preserved verbatim (already
 *     lowercase + trim by the factory's `normalizeCategory`).
 *   - `convertedCurrency` is preserved verbatim.
 *
 * Every field is `readonly`. The DTO surface mirrors the
 * public output; the UI (slice 4) and any future consumer
 * read the wire shape and never see the domain aggregate
 * directly.
 *
 * Cross-cutting invariants (carried from design §3.3.1):
 * - BR-RPT-2: the raw `category` field is preserved on every
 *   bucket alongside the normalized `categoryNormalized`.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no
 *   FX call in the read path.
 */

import type {
  CategoryBreakdown,
  CategoryBucket,
} from '../../domain/aggregates/category-breakdown';

export interface CategoryBreakdownDTO {
  readonly buckets: readonly CategoryBucketDTO[];
  readonly generatedAt: string; // ISO 8601
}

/**
 * The wire shape of one bucket. Mirrors the domain
 * `CategoryBucket` 1:1 (the DTO has no business
 * transformation — the factory already sorted and normalized).
 */
export interface CategoryBucketDTO {
  readonly category: string | null;
  readonly categoryNormalized: string;
  readonly convertedCurrency: CategoryBucket['convertedCurrency'];
  readonly amountMinor: number;
  readonly txCount: number;
}

export function toCategoryBreakdownDto(
  breakdown: CategoryBreakdown,
): CategoryBreakdownDTO {
  return {
    buckets: breakdown.buckets.map((b) => ({
      category: b.category,
      categoryNormalized: b.categoryNormalized,
      convertedCurrency: b.convertedCurrency,
      amountMinor: b.amountMinor,
      txCount: b.txCount,
    })),
    generatedAt: breakdown.generatedAt.toISOString(),
  };
}
