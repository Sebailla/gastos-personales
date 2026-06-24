// smoke-minimal, not production
/**
 * /transactions/[id] — Server Component.
 *
 * The detail page renders:
 * 1. The transaction row in a `<dl>` (description list):
 *    `id`, `date`, `direction`, `amount`, `convertedAmount`,
 *    `fxAsOfSnapshot` rendered as "Rate as of: <ISO>"
 *    (per the design §18 risk mitigation), `casaSnapshot`,
 *    `memo`, `category`, `accountId`.
 * 2. An edit form pre-populated with the current row.
 * 3. A delete button with confirm dialog.
 *
 * Auth gate (REQ-TX-6): missing session → redirect to
 * `/auth/signin?callbackUrl=/transactions/<id>`.
 * 404 from the API → redirect to `/transactions?toast=not-found`.
 *
 * The Server Action `updateTransactionServerAction` posts a
 * PATCH to `/api/transactions/<id>`; `deleteTransactionServerAction`
 * DELETEs the row. Both go through `serverHonoRequest`.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { TransactionDetailForms } from './transaction-detail-forms';
import { EphemeralToast } from '../../_components/ephemeral-toast';
import { Suspense } from 'react';
import type { ErrorEnvelope, TransactionWire } from '../../_lib/transaction-types';
import { formatMinor } from '../../_lib/format-minor';

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  // Render the full ISO timestamp for the FX snapshot — the
  // design §18 risk mitigation surfaces the snapshot so a
  // reviewer can audit the conversion.
  return iso;
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    const { id } = await params;
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent(`/transactions/${id}`));
  }

  const { id } = await params;
  const res = await serverHonoRequest(`/api/transactions/${id}`);
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent(`/transactions/${id}`));
  }
  if (res.status === 404) {
    redirect('/transactions?toast=not-found');
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    throw new Error(errBody?.error?.message ?? `get failed (${res.status})`);
  }
  const body = (await res.json()) as { data: TransactionWire };
  const tx = body.data;

  return (
    <main className="p-6">
      <header className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Transaction {tx.id.slice(0, 8)}…</h1>
        <a href="/transactions" className="text-sm text-blue-600 hover:underline">
          ← Back to transactions
        </a>
      </header>

      <Suspense>
        <EphemeralToast searchParamKey="toast" />
      </Suspense>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 mb-6">
        <dt className="font-semibold">Date</dt>
        <dd>{formatDate(tx.transactionDate)}</dd>

        <dt className="font-semibold">Direction</dt>
        <dd>{tx.direction}</dd>

        <dt className="font-semibold">Amount</dt>
        <dd className="font-mono">{formatMinor(tx.amountMinor, tx.currency)}</dd>

        <dt className="font-semibold">Converted amount</dt>
        <dd className="font-mono">{formatMinor(tx.convertedAmountMinor, tx.convertedCurrency)}</dd>

        <dt className="font-semibold">Rate as of</dt>
        <dd className="font-mono text-sm">{formatDateTime(tx.fxAsOfSnapshot)}</dd>

        <dt className="font-semibold">Casa</dt>
        <dd>{tx.casaSnapshot ?? '—'}</dd>

        <dt className="font-semibold">Account</dt>
        <dd className="font-mono text-xs">{tx.accountId}</dd>

        <dt className="font-semibold">Memo</dt>
        <dd>{tx.memo ?? '—'}</dd>

        <dt className="font-semibold">Category</dt>
        <dd>{tx.category ?? '—'}</dd>
      </dl>

      <TransactionDetailForms id={tx.id} tx={tx} />
    </main>
  );
}
