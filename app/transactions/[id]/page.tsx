/**
 * /transactions/[id] — Server Component production render.
 *
 * Per design §7.3 + §18 risk mitigation:
 * - The detail page renders the wire fields grouped into the
 *   four sections (Identification / Amount / FX snapshot /
 *   Audit) inside a Card layout.
 * - The FX snapshot section renders `fxAsOfSnapshot` +
 *   `casaSnapshot` as READ-ONLY fields per REQ-TX-15
 *   (immutable post-write).
 * - Edit / Delete actions mount a CardFooter.
 *
 * Auth gate (REQ-TX-6): missing session → redirect to
 * `/auth/signin?callbackUrl=/transactions/<id>` (URL-encoded).
 * 404 from the API → redirect to `/transactions?toast=not-found`.
 *
 * The `EphemeralToast` is mounted for the `?toast=created` and
 * `?toast=updated` post-action redirects.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { PageContainer } from '../../_ui/layout/page-container';
import { PageHeader } from '../../_ui/layout/page-header';
import { TransactionDetailForms } from './transaction-detail-forms';
import { EphemeralToast } from '../../_components/ephemeral-toast';
import type { ErrorEnvelope, TransactionWire } from '../../_lib/transaction-types';

export const dynamic = 'force-dynamic';

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
    <PageContainer>
      <PageHeader
        title={`Transaction ${tx.id.slice(0, 8)}…`}
        description={`Recorded on ${tx.transactionDate.slice(0, 10)} (${tx.direction.toLowerCase()}).`}
      />

      <Suspense>
        <EphemeralToast searchParamKey="toast" />
      </Suspense>

      <TransactionDetailForms id={tx.id} tx={tx} />
    </PageContainer>
  );
}
