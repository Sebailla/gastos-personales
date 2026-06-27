/**
 * DTOs for `MonthlySummary`.
 *
 * Slice 2 deliverable — wire shape returned by
 * `GET /api/reports/monthly`. The mapper is mechanical: it
 * carries no business logic, only shape conversion
 * (design §5.7):
 *
 *   - `Date` fields (`generatedAt`) → ISO-8601 string.
 *   - `null` is preserved (the absence of a value is a
 *     meaningful signal to the UI).
 *   - `convertedCurrency` is preserved verbatim (no
 *     lowercase; the wire form matches the enum value).
 *
 * Every field is `readonly` (immutability at the type level).
 * The DTO surface mirrors the public output; the UI (slice 4)
 * and any future consumer (e.g. `snapshots`) read the wire
 * shape and never see the domain aggregate directly.
 *
 * Cross-cutting invariants (carried from design §3.2):
 * - BR-RPT-1: groups by `convertedCurrency`, never raw
 *   `currency`.
 * - BR-ACC-12: aggregates never call the FX provider in the
 *   read path; the snapshot columns are the totals source.
 */

import type { MonthlySummary, MonthlyTotals } from '../../domain/aggregates/monthly-summary';

/**
 * The wire shape. `generatedAt` is an ISO-8601 string
 * (`Date.toISOString()`); the route layer surfaces it on the
 * JSON envelope.
 */
export interface MonthlySummaryDTO {
  readonly totals: readonly MonthlyTotalsDTO[];
  readonly generatedAt: string; // ISO 8601
}

/**
 * The wire shape of one totals row. Mirrors the domain
 * `MonthlyTotals` 1:1 (the DTO has no business transformation
 * — the totals are already signed-minor-units per design §3.2.1).
 */
export interface MonthlyTotalsDTO {
  readonly convertedCurrency: MonthlyTotals['convertedCurrency'];
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly netMinor: number;
  readonly count: number;
}

/**
 * Convert a domain `MonthlySummary` aggregate to the public
 * DTO. Pure function: no I/O, no clock, no FX call. The
 * action layer maps the result to the wire envelope.
 */
export function toMonthlySummaryDto(summary: MonthlySummary): MonthlySummaryDTO {
  return {
    totals: summary.totals.map((t) => ({
      convertedCurrency: t.convertedCurrency,
      incomeMinor: t.incomeMinor,
      expenseMinor: t.expenseMinor,
      netMinor: t.netMinor,
      count: t.count,
    })),
    generatedAt: summary.generatedAt.toISOString(),
  };
}
