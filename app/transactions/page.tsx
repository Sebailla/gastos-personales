// smoke-minimal, not production
/**
 * Transactions list page — Server Component.
 *
 * BR-TX-15: the smoke UI is API-first (slice-5 hard guardrail
 * #7). The list call goes through `serverHonoRequest` (no
 * application actions directly).
 *
 * Auth gate (REQ-TX-6): missing session → redirect to
 * `/auth/signin?callbackUrl=/transactions` (encoded).
 *
 * Pagination: the list query carries `limit=50`. The
 * truncation footer ("Showing first 50 of N") renders only
 * when `body.data.length === 50` and a `nextCursor` is set
 * (the smoke UI does not yet render a "Next" link — the
 * pagination is a smoke verification, not a production UX).
 *
 * The `EphemeralToast` is mounted on this page because both
 * the post-create redirect (REQ-TX-15) and the post-delete
 * redirect land on `/transactions` with a `?toast=…` query
 * parameter.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { serverHonoRequest } from '@/lib/server-hono';
import { TransactionsListTable } from '../_components/transactions-list-table';
import { EphemeralToast } from '../_components/ephemeral-toast';
import type { TransactionsListResponse, ErrorEnvelope } from '../_lib/transaction-types';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions'));
  }

  const res = await serverHonoRequest('/api/transactions?limit=50');
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions'));
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    const message = errBody?.error?.message ?? `list failed (${res.status})`;
    throw new Error(message);
  }
  const body = (await res.json()) as TransactionsListResponse;

  return (
    <main className="p-6">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <a href="/transactions/new" className="rounded bg-blue-600 text-white px-3 py-1">
          New transaction
        </a>
      </header>

      <Suspense>
        <EphemeralToast searchParamKey="toast" />
      </Suspense>

      {body.data.length === 0 ? (
        <p>No transactions yet — record one</p>
      ) : (
        <TransactionsListTable transactions={body.data} hasMore={body.nextCursor !== null} />
      )}
    </main>
  );
}
