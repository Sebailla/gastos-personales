/**
 * AccountFlowCard — pure render Server Component.
 *
 * v1 contract (design §9.2): the dashboard does NOT deep-link
 * to the flow endpoint. The card renders the empty state in
 * every visit. A future SDD change that adds an account picker
 * will pass a non-empty `AccountFlowDTO` to this card and the
 * populated branch will render — the smoke contract here
 * only pins the empty state for now.
 *
 * The `(UTC)` label + the `YYYY-MM` month string explain the
 * bucketing decision: per-day rows carry `YYYY-MM-DD` UTC keys
 * (BR-RPT-3, design §3.6) and the day window spans the calendar
 * month anchored at UTC midnight. Surfacing the marker on the
 * card means the user can reason about "the June window"
 * without timezone ambiguity — the same UTC day boundary is
 * used by the month value object and the Prisma adapter (see
 * dashboard-monthly-summary.tsx for the cross-card note).
 *
 * No `'use client'` directive. The component is a pure render
 * Server Component; the dashboard page owns the data fetch
 * (API-first pattern, architecture-standards rule). v1 does
 * NOT call the flow endpoint at all.
 */

interface Props {
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

export function AccountFlowCard({ month }: Props) {
  return (
    <section className="border border-gray-300 rounded p-4" aria-labelledby="account-flow-heading">
      <header className="mb-2">
        <h2 id="account-flow-heading" className="text-lg font-semibold">
          Flujo por cuenta
        </h2>
        <p className="text-xs text-gray-600">{month} (UTC)</p>
      </header>

      <p className="text-sm text-gray-700">Sin datos</p>
    </section>
  );
}
