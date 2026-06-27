/**
 * Dashboard page — Server Component.
 *
 * API-first RSC (slice 5 hard guardrail #7, design §9.2): the
 * page fetches via `serverHonoRequest`, never imports from
 * `src/modules/reports/...` directly. The UI is a presentation
 * layer over the Hono API; the page owns the data flow.
 *
 * Per design §9.2, the dashboard calls the monthly + breakdown
 * endpoints in parallel (both keyed on `month=YYYY-MM`). The
 * flow endpoint is intentionally NOT called in v1 — the
 * dashboard does NOT deep-link to an account (see design §9.2
 * and tasks.md §Slice 4). The `AccountFlowCard` renders the
 * empty state in every visit; a future SDD change adds the
 * account picker.
 *
 * Auth gate (REQ-RPT-7 / Next.js standard pattern): missing
 * session → redirect to `/auth/signin?callbackUrl=/dashboard`.
 * The session presence check lives in the Server Component
 * because Next.js Server Components ARE the route handler;
 * the §10.5 "Auth in domain" rule applies to domain business
 * permissions (e.g. "can this user edit this transaction?"),
 * not to session routing. The Hono routes already enforce
 * the per-user authorization at the wire boundary (the
 * cross-user 404 path in `routes.test.ts`); the page just
 * gates on session presence so anonymous requests never
 * reach the API.
 *
 * Month derivation: the page computes `currentMonth` as the
 * UTC `YYYY-MM` for "now". The Month value object lives in
 * `src/modules/reports/domain/value-objects/month.ts`; the
 * UI cannot import it (architecture-standards rule: UI does
 * not import domain), so the same shape is hand-derived here.
 * Both the API call and the card label use the same string
 * so the bucket boundary matches.
 *
 * Response validation (§10.5 "All input validated with
 * schema"): the response body is parsed through Zod before
 * being passed to the cards. The local schemas are declared
 * next to this file (the UI does not import from
 * `src/modules/reports/...` per the API-first rule); drift
 * surfaces as a Zod parse error here, not as a silent type
 * mismatch on the consumer.
 *
 * Locale: per tasks.md §Slice 4 the dashboard copy is
 * Spanish ("Resumen mensual", "Por categoría", "Flujo por
 * cuenta", "Sin datos", "Registrar primera transacción"). The
 * cards already use Spanish; the CTA copy here matches. The
 * `<h1>Dashboard</h1>` header and the `(UTC)` marker stay in
 * English as universal terms; the project mixes locales
 * across pages (transactions page is English, account
 * balance widget is Spanish).
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { MonthlySummaryCard } from '../_components/dashboard-monthly-summary';
import { CategoryBreakdownCard } from '../_components/dashboard-category-breakdown';
import { AccountFlowCard } from '../_components/dashboard-account-flow';
import type { MonthlySummaryDTO, CategoryBreakdownDTO, ErrorEnvelope } from '../_lib/report-types';

// Local response schemas — mirrors `app/_lib/report-types.ts`.
// The UI cannot import the application DTOs from
// `src/modules/reports/...` (architecture-standards rule), so
// the schemas are hand-maintained here. Drift between the
// DTO mapper and these schemas surfaces as a Zod parse error
// on every page load, not as a silent type mismatch.
const monthlySummaryResponseSchema: z.ZodType<MonthlySummaryDTO> = z.object({
  totals: z.array(
    z.object({
      convertedCurrency: z.string(),
      incomeMinor: z.number(),
      expenseMinor: z.number(),
      netMinor: z.number(),
      count: z.number(),
    }),
  ),
  generatedAt: z.string(),
});

const categoryBreakdownResponseSchema: z.ZodType<CategoryBreakdownDTO> = z.object({
  buckets: z.array(
    z.object({
      category: z.string().nullable(),
      categoryNormalized: z.string(),
      convertedCurrency: z.string(),
      amountMinor: z.number(),
      txCount: z.number(),
    }),
  ),
  generatedAt: z.string(),
});

const errorEnvelopeSchema: z.ZodType<ErrorEnvelope> = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const dynamic = 'force-dynamic';

function currentUtcMonth(now: Date = new Date()): string {
  // UTC YYYY-MM. Matches the Month value object's UTC bucketing
  // (src/modules/reports/domain/value-objects/month.ts) and the
  // Prisma adapter's UTC month window
  // (src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts).
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/dashboard'));
  }

  const month = currentUtcMonth();

  // Parallel fetch (monthly + breakdown). The flow endpoint
  // is intentionally omitted in v1 — see design §9.2.
  const [monthlyRes, breakdownRes] = await Promise.all([
    serverHonoRequest(`/api/reports/monthly?month=${month}`),
    serverHonoRequest(`/api/reports/breakdown?month=${month}`),
  ]);

  if (monthlyRes.status === 401 || breakdownRes.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/dashboard'));
  }
  if (!monthlyRes.ok) {
    const rawErr = await monthlyRes.json().catch(() => null);
    const errBody = errorEnvelopeSchema.safeParse(rawErr);
    const message = errBody.success
      ? errBody.data.error.message
      : `monthly failed (${monthlyRes.status})`;
    throw new Error(message);
  }
  if (!breakdownRes.ok) {
    const rawErr = await breakdownRes.json().catch(() => null);
    const errBody = errorEnvelopeSchema.safeParse(rawErr);
    const message = errBody.success
      ? errBody.data.error.message
      : `breakdown failed (${breakdownRes.status})`;
    throw new Error(message);
  }

  const summary = monthlySummaryResponseSchema.parse(await monthlyRes.json());
  const breakdown = categoryBreakdownResponseSchema.parse(await breakdownRes.json());

  // Empty-state CTA path: when both the monthly totals and
  // the breakdown buckets are empty AND the totals count is
  // zero, surface the CTA linking to /transactions/new per
  // design §9.2. The cards still render — the CTA sits
  // above the grid as a nudge to seed the first transaction.
  const isEmpty = summary.totals.length === 0 && breakdown.buckets.length === 0;

  return (
    <main className="p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-600">{month} (UTC)</p>
      </header>

      {isEmpty ? (
        // Empty-state CTA: nudge the user toward their first
        // transaction. Per design section 9.2 the CTA links to
        // /transactions/new (the create form), not /transactions
        // (the list); the copy mirrors the form's submit intent
        // ("Registrar primera transacción").
        <div className="mb-4 rounded border border-blue-300 bg-blue-50 p-4">
          <p className="mb-2 text-sm text-blue-900">Aún no tenés transacciones registradas.</p>
          <a
            href="/transactions/new"
            className="inline-block rounded bg-blue-600 px-3 py-1 text-white"
          >
            Registrar primera transacción
          </a>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MonthlySummaryCard summary={summary} month={month} />
        <CategoryBreakdownCard breakdown={breakdown} month={month} />
        <AccountFlowCard month={month} />
      </div>
    </main>
  );
}
