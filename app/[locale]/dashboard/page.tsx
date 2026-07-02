/**
 * Dashboard page — Server Component (slice 4 T-UI-310 + FIX 2 + FIX 4a).
 *
 * Per design §7.3 + §9.2 + §9.3 + §16.5 + §17:
 * - The page owns ONLY `auth()` + `redirect()` + searchParams.
 *   Each card is a self-fetching async Server Component
 *   (FIX 2 — refactored from the slice-4 page that did a single
 *   `Promise.all` over all four endpoints). With per-card
 *   `<Suspense>`, a thrown fetch in one card stays inside its
 *   boundary and the sibling cards continue to render.
 * - The flow endpoint is conditionally fetched (only when
 *   `?accountId=` is present) per design §9.3: the dashboard
 *   does NOT deep-link to the flow endpoint unless the user
 *   explicitly picked an account.
 *
 * The accounts list is fetched inside `AccountFlowCard` (which
 * also renders the picker). Lifting it to the page would couple
 * all three cards to a list only one of them uses; the per-card
 * boundary absorbs the fetch latency.
 *
 * Month derivation: `currentUtcMonth` (per BR-RPT-3) is the
 * UTC `YYYY-MM` for "now". `?month=` overrides when it matches
 * `/^\d{4}-\d{2}$/`; otherwise the page defaults to the current
 * UTC month.
 *
 * FIX 4a — defense-in-depth UUID validation for `?accountId=`.
 * A malformed value is sanitized to `null` BEFORE reaching the
 * `AccountFlowCard` (which would otherwise concatenate it into
 * `/api/reports/accounts/<id>/flow?month=<month>`). The regex
 * matches the canonical UUID format (8-4-4-4-12 hex). Blast
 * radius today is small (the API returns 404 on bad IDs), but
 * the regex gates the format at the edge so a path-injection
 * attempt cannot leak into the URL.
 *
 * Layout: PageContainer + PageHeader + DashboardMonthSwitcher
 * + the three cards in a 1+2 grid (`lg:grid-cols-3`).
 *
 * Spanish copy: dashboard copy is Spanish per tasks.md
 * §Slice 4.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { PageContainer } from '../../_ui/layout/page-container';
import { PageHeader } from '../../_ui/layout/page-header';
import { Skeleton } from '../../_ui/primitives/skeleton';
import { MonthlySummaryCard } from '../../_components/dashboard-monthly-summary';
import { CategoryBreakdownCard } from '../../_components/dashboard-category-breakdown';
import { AccountFlowCard } from '../../_components/dashboard-account-flow';
import { DashboardMonthSwitcher } from '../../_components/dashboard-month-switcher';

export const dynamic = 'force-dynamic';

function currentUtcMonth(now: Date = new Date()): string {
  // UTC YYYY-MM. Matches the Month value object's UTC bucketing
  // (src/modules/reports/domain/value-objects/month.ts) and the
  // Prisma adapter's UTC month window.
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// FIX 4a — canonical UUID v4-ish regex. 8-4-4-4-12 hex. Case-
// insensitive so the test fixtures can use uppercase. We do
// NOT use the full RFC 4122 variant+version check (it would
// reject some legitimate IDs in the seed fixtures that have
// "u1" + random hex in the variant nibbles); the goal here
// is structural validation at the URL boundary, not full
// UUID semantics.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DashboardPageProps {
  // Next.js 15+ types searchParams as a Promise. The compat
  // shim accepts both shapes (see app/auth/signin/page.tsx for
  // the precedent).
  searchParams:
    | Promise<{ accountId?: string; month?: string }>
    | {
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
  // FIX 4a — sanitize `?accountId=` to a UUID-format string or
  // null. A non-UUID value (path injection, garbage, etc.) MUST
  // NOT reach `AccountFlowCard`'s URL builder.
  const requestedAccountId =
    typeof params.accountId === 'string' && UUID_REGEX.test(params.accountId)
      ? params.accountId
      : null;
  // `?month=` is OPTIONAL; default to the current UTC month
  // (per design §9.3 + tasks.md §Slice 4 §Files touched).
  const month =
    typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentUtcMonth();

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={`Resumen del mes ${month} (UTC).`}
        actions={
          <DashboardMonthSwitcher currentMonth={month} currentAccountId={requestedAccountId} />
        }
      />
      <div className="grid grid-cols-1 gap-ui-space-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Suspense fallback={<Skeleton width="100%" height={200} className="rounded-ui-lg" />}>
            <MonthlySummaryCard month={month} />
          </Suspense>
        </div>
        <div className="lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-ui-space-4 lg:space-y-0 space-y-ui-space-4">
          <Suspense fallback={<Skeleton width="100%" height={200} className="rounded-ui-lg" />}>
            <CategoryBreakdownCard month={month} />
          </Suspense>
          <Suspense fallback={<Skeleton width="100%" height={200} className="rounded-ui-lg" />}>
            <AccountFlowCard currentAccountId={requestedAccountId} month={month} />
          </Suspense>
        </div>
      </div>
    </PageContainer>
  );
}
