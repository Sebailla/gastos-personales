// smoke-minimal, not production
/**
 * /accounts/[id] — Server Component.
 *
 * BR-ACC-14: missing session → redirect to
 * `/auth/signin?callbackUrl=/accounts/[id]`.
 * BR-ACC-19: API `404` → redirect to
 * `/accounts?toast=not-found` (the list page mounts the
 * EphemeralToast and renders "Account not found or no
 * access" for ~3 s).
 *
 * The detail page renders the full row in a `<dl>` via
 * the `AccountDetail` pure render component, and embeds
 * the `BalanceWidget` Client Component for the FX
 * conversion form.
 *
 * The Hono API call is in-process via `serverHonoRequest`.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { serverHonoRequest } from '@/lib/server-hono';
import { AccountDetail } from './account-detail';
import { BalanceWidget } from './balance-widget';
import type { ErrorEnvelope, FinancialAccountWire } from '../../_lib/account-types';

export const dynamic = 'force-dynamic';

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    const { id } = await params;
    redirect(
      '/auth/signin?callbackUrl=' + encodeURIComponent(`/accounts/${id}`),
    );
  }

  const { id } = await params;
  const res = await serverHonoRequest(`/api/accounts/${id}`);
  if (res.status === 401) {
    redirect(
      '/auth/signin?callbackUrl=' + encodeURIComponent(`/accounts/${id}`),
    );
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
    <main className="p-6">
      <header className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold">{account.name}</h1>
        <a
          href="/accounts"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to accounts
        </a>
      </header>

      <AccountDetail account={account} />

      <BalanceWidget
        accountId={account.id}
        nativeAmount={account.openingBalanceMinor}
        nativeCurrency={account.currency as 'ARS' | 'USD' | 'EUR'}
      />
    </main>
  );
}
