// smoke-minimal, not production
/**
 * MonthlySummaryCard — pure render Server Component.
 *
 * Renders the monthly totals table for the dashboard. Per
 * design §9.3: the columns are Currency, Ingresos, Gastos,
 * Neto, # (count). The currency column is `convertedCurrency`
 * (BR-RPT-1, BR-ACC-12) — never the raw transaction currency.
 *
 * Empty state (`totals.length === 0`): renders the "Sin datos"
 * message + the month label + the UTC marker. The smoke UI
 * intentionally surfaces the empty state uniformly for
 * zero-accounts and zero-transactions (design §12.7).
 *
 * The `(UTC)` label + the `YYYY-MM` month string explain the
 * bucketing decision: every totals row groups transactions by
 * `convertedCurrency` within a calendar month anchored at UTC
 * midnight (BR-RPT-3). Surfacing the marker on the card means
 * the user can reason about "the June column" without
 * timezone ambiguity — the same UTC day boundary is used by
 * the month value object (`src/modules/reports/domain/value-objects/month.ts`)
 * and the Prisma adapter (`src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts`).
 *
 * No `'use client'` directive. The component is a pure render
 * Server Component that takes the pre-fetched DTO as a prop;
 * the dashboard page owns the data fetch (API-first pattern,
 * architecture-standards rule).
 */

import type { MonthlySummaryDTO } from '../_lib/report-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  summary: MonthlySummaryDTO;
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

export function MonthlySummaryCard({ summary, month }: Props) {
  const isEmpty = summary.totals.length === 0;

  return (
    <section
      className="border border-gray-300 rounded p-4"
      aria-labelledby="monthly-summary-heading"
    >
      <header className="mb-2">
        <h2 id="monthly-summary-heading" className="text-lg font-semibold">
          Resumen mensual
        </h2>
        <p className="text-xs text-gray-600">{month} (UTC)</p>
      </header>

      {isEmpty ? (
        <p className="text-sm text-gray-700">Sin datos</p>
      ) : (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">Currency</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Ingresos</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Gastos</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Neto</th>
              <th className="border border-gray-300 px-3 py-2 text-right">#</th>
            </tr>
          </thead>
          <tbody>
            {summary.totals.map((t) => (
              <tr key={t.convertedCurrency}>
                <td className="border border-gray-300 px-3 py-2">{t.convertedCurrency}</td>
                <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                  {formatMinor(t.incomeMinor, t.convertedCurrency)}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                  {formatMinor(t.expenseMinor, t.convertedCurrency)}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                  {formatMinor(t.netMinor, t.convertedCurrency)}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right">{t.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
