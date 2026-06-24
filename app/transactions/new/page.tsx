// smoke-minimal, not production
/**
 * /transactions/new — Server Component shell.
 *
 * The form embeds `CreateTransactionForm` (this file's
 * default export, a Client Component). The shell:
 * 1. Resolves the session via `auth()`.
 * 2. Redirects to `/auth/signin?callbackUrl=/transactions/new`
 *    when no session.
 * 3. Loads the live (non-archived) accounts via
 *    `GET /api/accounts?archivedAt=null&limit=100` to populate
 *    the `<select name="accountId">` dropdown.
 * 4. Renders the form with the account options.
 *
 * The Server Action is `createTransactionServerAction`
 * (`app/_actions/transactions-server-actions.ts`). It posts
 * to `/api/transactions` via `serverHonoRequest` (API-first).
 * On 201 → redirect to `/transactions/<id>?toast=created`.
 * On 4xx/5xx → the form throws with the API's error message.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { serverHonoRequest } from '@/lib/server-hono';
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

  // Load live accounts for the <select name="accountId"> dropdown.
  const accountsRes = await serverHonoRequest('/api/accounts?archivedAt=null&limit=100');
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
    <main className="p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">New transaction</h1>
      </header>
      <CreateTransactionForm accounts={accountsBody.data} />
    </main>
  );
}
