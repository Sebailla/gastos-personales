// smoke-minimal, not production
/**
 * CategoryBreakdownCard — pure render Server Component.
 *
 * Renders the category breakdown table for the dashboard.
 * Per design §9.3: the columns are Categoría, Monto, Tx. The
 * rows render in input order — the domain factory already
 * sorts by `amountMinor DESC` primary and
 * `categoryNormalized ASC` secondary (BR-RPT-2, §3.3.1), so
 * the component trusts the wire shape and does NOT re-sort.
 *
 * Empty state (`buckets.length === 0`): renders the "Sin
 * datos" message + the month label + the UTC marker. The
 * zero-accounts / zero-transactions case (design §12.7) is
 * rendered uniformly with the empty-buckets case.
 *
 * The `(UTC)` label + the `YYYY-MM` month string explain the
 * bucketing decision: every bucket groups transactions by
 * `(categoryNormalized, convertedCurrency)` within a calendar
 * month anchored at UTC midnight (BR-RPT-3, design §3.6). The
 * smoke UI surfaces the marker so the user can reason about
 * which month the breakdown is for without timezone
 * ambiguity — the same UTC day boundary is used by the
 * month value object and the Prisma adapter (see
 * dashboard-monthly-summary.tsx for the cross-card note).
 *
 * No `'use client'` directive. The component is a pure render
 * Server Component that takes the pre-fetched DTO as a prop;
 * the dashboard page owns the data fetch (API-first pattern,
 * architecture-standards rule).
 */

import type { CategoryBreakdownDTO } from '../_lib/report-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  breakdown: CategoryBreakdownDTO;
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

export function CategoryBreakdownCard({ breakdown, month }: Props) {
  const isEmpty = breakdown.buckets.length === 0;

  return (
    <section
      className="border border-gray-300 rounded p-4"
      aria-labelledby="category-breakdown-heading"
    >
      <header className="mb-2">
        <h2 id="category-breakdown-heading" className="text-lg font-semibold">
          Por categoría
        </h2>
        <p className="text-xs text-gray-600">{month} (UTC)</p>
      </header>

      {isEmpty ? (
        <p className="text-sm text-gray-700">Sin datos</p>
      ) : (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">Categoría</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Monto</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Tx</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.buckets.map((b) => (
              <tr key={`${b.categoryNormalized}-${b.convertedCurrency}`}>
                <td className="border border-gray-300 px-3 py-2">
                  {/* Surface the normalized category label;
                      the raw `category` field is preserved on
                      the DTO for debugging but the smoke UI
                      displays the normalized form (BR-RPT-2). */}
                  {b.categoryNormalized}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                  {formatMinor(b.amountMinor, b.convertedCurrency)}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right">{b.txCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
