// smoke-minimal, not production
/**
 * Accounts list page — Server Component.
 *
 * BR-ACC-14: missing session → redirect to
 * `/auth/signin?callbackUrl=/accounts` (encoded).
 * BR-ACC-17: list query carries `archivedAt=null` so the
 * archived accounts are filtered out at the API.
 *
 * The list query always passes `limit=50` so the response
 * is at most 50 rows; the truncation footer
 * ("Showing first 50 of N") renders only when
 * `body.total > 50`.
 *
 * The Hono API call is in-process via `serverHonoRequest`
 * (no fetch round-trip, no `NEXT_PUBLIC_API_URL` env var,
 * no SSRF surface). The typed client wrapper at
 * `src/lib/api-client.ts` exists for future Client Component
 * use; the Server Component does not need it.
 *
 * The `EphemeralToast` is mounted on this page because both
 * the post-create redirect (BR-ACC-16) and the detail 404
 * redirect (BR-ACC-19) land on `/accounts` with a
 * `?toast=…` query parameter. The toast is wrapped in
 * `<Suspense>` because `useSearchParams()` requires a
 * Suspense boundary in Next.js 16+; without it, the entire
 * route falls back to client-side rendering.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { AccountsListTable } from './accounts-list-table';
import { EphemeralToast } from '../_components/ephemeral-toast';
import type { AccountsListResponse, ErrorEnvelope } from '../_lib/account-types';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts'));
  }

  const res = await serverHonoRequest('/api/accounts?limit=50&archivedAt=null');
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts'));
  }
  if (!res.ok) {
    // Smoke UI is hand-verified; surface a generic error
    // and let the developer diagnose. No error boundary
    // beyond Next.js's default `error.tsx`.
    const errBody = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    const message = errBody?.error?.message ?? `list failed (${res.status})`;
    throw new Error(message);
  }
  const body = (await res.json()) as AccountsListResponse;

  return (
    <main className="p-6">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <a href="/accounts/new" className="rounded bg-blue-600 text-white px-3 py-1">
          New account
        </a>
      </header>

      <Suspense>
        <EphemeralToast searchParamKey="toast" />
      </Suspense>

      {body.data.length === 0 ? (
        <p>No accounts yet — create one</p>
      ) : (
        <AccountsListTable accounts={body.data} total={body.total} />
      )}
    </main>
  );
}
