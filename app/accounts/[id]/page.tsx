/**
 * /accounts/[id] — Server Component production render.
 *
 * BR-ACC-14: missing session → redirect to
 * `/auth/signin?callbackUrl=/accounts/[id]`.
 * BR-ACC-19: API `404` → redirect to
 * `/accounts?toast=not-found`.
 *
 * Per design §7.3 the detail page renders a PageHeader +
 * Card + AccountDetail. The BalanceWidget Client Component
 * is reused unchanged (no logic change — it owns the FX
 * conversion form for the detail).
 *
 * The Hono API call is in-process via `serverHonoRequest`.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { PageContainer } from '../../_ui/layout/page-container';
import { PageHeader } from '../../_ui/layout/page-header';
import { Link } from '../../_ui/primitives/link';
import { AccountDetail } from './account-detail';
import { BalanceWidget } from './balance-widget';
import type { ErrorEnvelope, FinancialAccountWire } from '../../_lib/account-types';

export const dynamic = 'force-dynamic';

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent(`/accounts/${id}`));
  }

  const res = await serverHonoRequest(`/api/accounts/${id}`);
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent(`/accounts/${id}`));
  }
  if (res.status === 404) {
    redirect('/accounts?toast=not-found');
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    const message = errBody?.error?.message ?? `get failed (${res.status})`;
    throw new Error(message);
  }
  const body = (await res.json()) as { data: FinancialAccountWire };
  const account = body.data;

  return (
    <PageContainer>
      <PageHeader
        title={account.name}
        actions={
          <Link
            href="/accounts"
            className="rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-fg hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent"
          >
            ← Back to accounts
          </Link>
        }
      />
      <div className="flex flex-col gap-ui-space-6">
        <AccountDetail account={account} />
        <BalanceWidget
          accountId={account.id}
          nativeAmount={account.openingBalanceMinor}
          nativeCurrency={account.currency as 'ARS' | 'USD' | 'EUR'}
        />
      </div>
    </PageContainer>
  );
}
