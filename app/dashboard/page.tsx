/**
 * Dashboard page — Server Component (slice 4 T-UI-310).
 *
 * Per design §7.3 + §9.2 + §9.3 + §17: the page reads
 * `?accountId=` and `?month=` from searchParams, fetches the
 * three reports endpoints in parallel via `Promise.all`,
 * and renders the three Card compounds inside a 1+2 grid.
 *
 * Architecture rules preserved from the slice 2/3 precedent:
 * - API-first RSC: the page fetches via `serverHonoRequest`,
 *   never imports from `src/modules/reports/...` directly.
 * - Auth gate (`auth()` + `redirect()`) is unchanged.
 * - Response validation: each response body is parsed through
 *   Zod before being passed to the cards (drift surfaces as a
 *   Zod parse error on every page load, not as a silent type
 *   mismatch on the consumer).
 *
 * Parallel fetch (design §17): three Hono calls run
 * concurrently via `Promise.all`. The flow endpoint is
 * ONLY called when `?accountId=` is present in the search
 * params — the dashboard does NOT deep-link to the flow
 * endpoint unless the user explicitly picked an account
 * from the picker.
 *
 * Month derivation: `currentUtcMonth` (per BR-RPT-3) is the
 * UTC `YYYY-MM` for "now". The MonthSwitcher uses the same
 * helper internally; the page reads the override from
 * `?month=` when present, otherwise defaults to the current
 * UTC month.
 *
 * The `accounts` list is fetched alongside the three
 * reports endpoints so the picker in the AccountFlowCard's
 * CardHeader has data to render. The list call is
 * `?archivedAt=null` (BR-ACC-17) and uses the existing
 * `/api/accounts` endpoint.
 *
 * Layout: PageContainer + PageHeader + DashboardMonthSwitcher
 * (in PageHeader.actions) + the three cards in a 1+2 grid
 * on large viewports (`lg:grid-cols-3`) and stacked on
 * smaller viewports.
 *
 * Spanish copy: dashboard copy is Spanish per tasks.md
 * §Slice 4. The MonthSwitcher's current label + the picker
 * are the only UI surfaces; cards carry their own copy.
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { PageContainer } from '../_ui/layout/page-container';
import { PageHeader } from '../_ui/layout/page-header';
import { MonthlySummaryCard } from '../_components/dashboard-monthly-summary';
import { CategoryBreakdownCard } from '../_components/dashboard-category-breakdown';
import { AccountFlowCard } from '../_components/dashboard-account-flow';
import { DashboardMonthSwitcher } from '../_components/dashboard-month-switcher';
import type {
  MonthlySummaryDTO,
  CategoryBreakdownDTO,
  AccountFlowDTO,
  ErrorEnvelope,
} from '../_lib/report-types';
import type {
  AccountsListResponse,
  FinancialAccountWire,
} from '../_lib/account-types';

// Local response schemas — mirrors `app/_lib/report-types.ts`
// + `app/_lib/account-types.ts`. The UI cannot import the
// application DTOs from `src/modules/...` per the API-first
// rule; schemas are hand-maintained here. Drift between the
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

const accountFlowResponseSchema: z.ZodType<AccountFlowDTO> = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      netMinor: z.number(),
      runningBalanceMinor: z.number(),
      count: z.number(),
      convertedCurrency: z.string(),
    }),
  ),
  generatedAt: z.string(),
});

const financialAccountWireSchema: z.ZodType<FinancialAccountWire> = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  name: z.string(),
  currency: z.string(),
  openingBalanceMinor: z.number(),
  openingBalanceMode: z.string(),
  openingBalanceDate: z.string().nullable(),
  archivedAt: z.string().nullable(),
  bankName: z.string().nullable(),
  accountKind: z.string().nullable(),
  issuer: z.string().nullable(),
  creditLimitMinor: z.number().nullable(),
  statementDay: z.number().nullable(),
  paymentDueDay: z.number().nullable(),
  broker: z.string().nullable(),
  investmentType: z.string().nullable(),
  walletAddress: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // BR-UI-1: OPTIONAL `?include=lastActivity` flag.
  lastActivityAt: z.string().nullable().optional(),
});

const accountsListResponseSchema: z.ZodType<AccountsListResponse> = z.object({
  data: z.array(financialAccountWireSchema),
  nextCursor: z.string().nullable(),
  total: z.number(),
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
  // Prisma adapter's UTC month window.
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

interface DashboardPageProps {
  // Next.js 15+ types searchParams as a Promise. The compat
  // shim accepts both shapes (see app/auth/signin/page.tsx for
  // the precedent).
  searchParams: Promise<{ accountId?: string; month?: string }> | {
    accountId?: string;
    month?: string;
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/dashboard'));
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const requestedAccountId = typeof params.accountId === 'string' ? params.accountId : null;
  // `?month=` is OPTIONAL; default to the current UTC month
  // (per design §9.3 + tasks.md §Slice 4 §Files touched).
  const month =
    typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentUtcMonth();

  // Parallel fetch (design §17). The flow endpoint is
  // INTENTIONALLY omitted when no ?accountId= is present —
  // the dashboard does NOT deep-link to the flow endpoint
  // unless the user explicitly picked an account. We use a
  // conditional Promise.all keyed on `requestedAccountId` so
  // the destructure is always the same length and TS narrows
  // each slot precisely.
  const flowPromise: Promise<Response | null> = requestedAccountId
    ? serverHonoRequest(`/api/reports/accounts/${requestedAccountId}/flow?month=${month}`).then(
        (r) => r,
        // Surface a fetch error as a synthetic 500 so the
        // call site can decide; the `flow` slot is allowed
        // to be `null` because the dashboard degrades to
        // branch 1 silently when the deep link fails.
        (err) => new Response(JSON.stringify({ error: { code: 'NETWORK', message: String(err) } }), { status: 500 }),
      )
    : Promise.resolve(null);

  const [accountsRes, monthlyRes, breakdownRes, flowRes] = await Promise.all([
    serverHonoRequest(`/api/accounts?limit=50&archivedAt=null`),
    serverHonoRequest(`/api/reports/monthly?month=${month}`),
    serverHonoRequest(`/api/reports/breakdown?month=${month}`),
    flowPromise,
  ]);

  // Auth gate: any 401 in the batch redirects to signin.
  if (accountsRes.status === 401 || monthlyRes.status === 401 || breakdownRes.status === 401) {
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
  if (flowRes && !flowRes.ok) {
    // 404 on the flow endpoint means the user no longer has
    // access to this account (archived, cross-user, etc.) —
    // per design §9.3 we silently drop the deep link and
    // render the AccountFlowCard in its branch-1 state
    // (EmptyState + no aria-current). Non-404 failures throw
    // so the error boundary surfaces the failure.
    if (flowRes.status !== 404) {
      const flowBody = await flowRes.json().catch(() => null);
      const errBody = errorEnvelopeSchema.safeParse(flowBody);
      const message = errBody.success
        ? errBody.data.error.message
        : `flow failed (${flowRes.status})`;
      throw new Error(message);
    }
  }

  const summary = monthlySummaryResponseSchema.parse(await monthlyRes.json());
  const breakdown = categoryBreakdownResponseSchema.parse(await breakdownRes.json());
  const accountsBody = accountsListResponseSchema.parse(await accountsRes.json());
  // The accounts wire shape gives us `id + name` for the
  // picker; downstream types use the full `FinancialAccountWire`
  // shape but the picker only needs id + name.
  const accountsForPicker: ReadonlyArray<Pick<FinancialAccountWire, 'id' | 'name'>> =
    accountsBody.data;
  const flow =
    flowRes && flowRes.ok ? accountFlowResponseSchema.parse(await flowRes.json()) : null;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={`Resumen del mes ${month} (UTC).`}
        actions={
          <DashboardMonthSwitcher
            currentMonth={month}
            currentAccountId={requestedAccountId}
          />
        }
      />
      <div className="grid grid-cols-1 gap-ui-space-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <MonthlySummaryCard summary={summary} month={month} />
        </div>
        <div className="lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-ui-space-4 lg:space-y-0 space-y-ui-space-4">
          <CategoryBreakdownCard breakdown={breakdown} month={month} />
          <AccountFlowCard
            accounts={accountsForPicker}
            currentAccountId={requestedAccountId}
            flow={flow}
            month={month}
          />
        </div>
      </div>
    </PageContainer>
  );
}
