/**
 * /transactions/new — Server Component production render.
 *
 * Per design §7.3 + REQ-TX-15:
 * - The Server Component shell resolves the session via `auth()`.
 * - Missing session → redirect to
 *   `/auth/signin?callbackUrl=/transactions/new` (URL-encoded).
 * - Loads the live (non-archived) accounts via
 *   `GET /api/accounts?archivedAt=null&limit=100` to populate
 *   the form's Combobox.
 * - Renders `PageHeader` + `CreateTransactionForm`.
 *
 * The form is API-first; it POSTs to `/api/transactions` from
 * the Client Component (BR-TX-15 + design §9.1).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { PageContainer } from '../../_ui/layout/page-container';
import { PageHeader } from '../../_ui/layout/page-header';
import { CreateTransactionForm } from './create-transaction-form';
import type { ErrorEnvelope } from '../../_lib/account-types';

export const dynamic = 'force-dynamic';

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

export default async function NewTransactionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions/new'));
  }

  // Load live accounts for the Combobox.
  const accountsRes = await serverHonoRequest(
    '/api/accounts?archivedAt=null&limit=100',
  );
  if (accountsRes.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions/new'));
  }
  if (!accountsRes.ok) {
    const errBody = (await accountsRes.json().catch(() => null)) as ErrorEnvelope | null;
    throw new Error(errBody?.error?.message ?? `accounts load failed (${accountsRes.status})`);
  }
  const accountsBody = (await accountsRes.json()) as {
    data: AccountOption[];
  };

  return (
    <PageContainer>
      <PageHeader
        title="New transaction"
        description="Record an income or expense. The FX snapshot is computed at write time and is immutable thereafter."
      />
      <CreateTransactionForm accounts={accountsBody.data} />
    </PageContainer>
  );
}
