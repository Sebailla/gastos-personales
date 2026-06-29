/**
 * /transactions — Server Component production render.
 *
 * BR-TX-15 + BR-UI-2: the list call goes through
 * `serverHonoRequest` (no application actions directly). The
 * list query carries `?include=accountName` so the
 * `TransactionsListTable` can render the Account column. The
 * flag is additive on the API; without it, the wire response
 * omits `accountName` on every row and the table hides the
 * column. See the BR-UI-2 follow-up note in apply-progress.
 *
 * Auth gate (REQ-TX-6): missing session → redirect to
 * `/auth/signin?callbackUrl=/transactions` (URL-encoded).
 *
 * Pagination / sort: the table consumes the cursor from the
 * `nextCursor` wire field and surfaces a Pagination primitive
 * only when there is a next page. The page is `force-dynamic`
 * because the table renders `useState` (the Client Component)
 * which requires dynamic boundary; this also keeps the auth
 * gate fresh on every request.
 *
 * The `EphemeralToast` is mounted on this page because both
 * the post-create redirect (REQ-TX-15) and the post-delete
 * redirect land on `/transactions` with a `?toast=…` query
 * parameter.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { PageContainer } from '../_ui/layout/page-container';
import { PageHeader } from '../_ui/layout/page-header';
import { Link } from '../_ui/primitives/link';
import { TransactionsListTable } from '../_components/transactions-list-table';
import { EphemeralToast } from '../_components/ephemeral-toast';
import type {
  TransactionsListResponse,
  ErrorEnvelope,
} from '../_lib/transaction-types';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions'));
  }

  // BR-UI-2: ?include=accountName is OPTIONAL. We pass it so the
  // table can opt the Account column in. If the API is not yet
  // honoring the flag, no row carries the field and the table
  // hides the column entirely (a single non-undefined field
  // enables it conservatively for the whole table).
  const res = await serverHonoRequest(
    '/api/transactions?limit=50&include=accountName',
  );
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions'));
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    const message = errBody?.error?.message ?? `list failed (${res.status})`;
    throw new Error(message);
  }
  const body = (await res.json()) as TransactionsListResponse;

  const accountNameIncluded = body.data.some(
    (row) => 'accountName' in row,
  );

  return (
    <PageContainer>
      <PageHeader
        title="Transactions"
        actions={
          <Link
            href="/transactions/new"
            className="rounded-ui-md bg-ui-accent px-ui-space-4 py-ui-space-2 text-ui-text-sm font-ui-font-medium text-ui-accent-fg hover:bg-ui-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2"
          >
            + New transaction
          </Link>
        }
      />

      <Suspense>
        <EphemeralToast searchParamKey="toast" />
      </Suspense>

      <TransactionsListTable
        transactions={body.data}
        nextCursor={body.nextCursor}
        accountNameIncluded={accountNameIncluded}
      />
    </PageContainer>
  );
}
