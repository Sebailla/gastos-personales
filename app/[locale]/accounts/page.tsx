/**
 * /accounts — Server Component production render.
 *
 * BR-ACC-14: missing session → redirect to
 * `/auth/signin?callbackUrl=/accounts` (encoded).
 * BR-ACC-17: list query carries `archivedAt=null` so the
 * archived accounts are filtered out at the API.
 * BR-UI-1: the query MAY carry `?include=lastActivity` to
 * enrich the response with `lastActivityAt` per row (BR-UI-1
 * is OPTIONAL — the page handles the response shape with or
 * without the flag).
 *
 * Per design §7.3 + §15.2 the list page renders a
 * PageHeader + the AccountsListTable Client Component. The
 * table owns the empty state (EmptyState primitive with a CTA
 * to /accounts/new). The page does NOT paginate here in v1;
 * the API's `limit=50` default caps the response and the
 * `Pagination` primitive is mounted only when `body.total`
 * exceeds the page size.
 *
 * The Hono API call is in-process via `serverHonoRequest`
 * (no fetch round-trip, no `NEXT_PUBLIC_API_URL` env var,
 * no SSRF surface).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { serverHonoRequest } from '@/lib/server-hono';
import { PageContainer } from '../../_ui/layout/page-container';
import { PageHeader } from '../../_ui/layout/page-header';
import { Link } from '../../_ui/primitives/link';
import { AccountsListTable } from './accounts-list-table';
import type { AccountsListResponse, ErrorEnvelope } from '../../_lib/account-types';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts'));
  }

  // BR-UI-1: include=lastActivity is OPTIONAL. We pass it so the
  // dashboard's "recently used" column on the parent /accounts
  // surface can surface the Last activity column. If the API
  // does not implement the flag yet, the response simply omits
  // the field; the page renders the column header anyway (the
  // table itself decides whether to render the column based on
  // the `lastActivityIncluded` prop).
  const res = await serverHonoRequest('/api/accounts?limit=50&archivedAt=null&include=lastActivity');
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts'));
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    const message = errBody?.error?.message ?? `list failed (${res.status})`;
    throw new Error(message);
  }
  const body = (await res.json()) as AccountsListResponse;

  // The server fetched WITH the include=lastActivity flag. If
  // the flag is honored by the API, every row carries a
  // `lastActivityAt` field (string | null). If the API does
  // not yet honor the flag, no row carries it. We check the
  // first row to decide whether to opt the column in (the
  // check is conservative: a single non-undefined field is
  // enough to enable the column for the whole table).
  const lastActivityIncluded = body.data.some((row) => 'lastActivityAt' in row);

  return (
    <PageContainer>
      <PageHeader
        title="Accounts"
        actions={
          <Link
            href="/accounts/new"
            className="rounded-ui-md bg-ui-accent px-ui-space-4 py-ui-space-2 text-ui-text-sm font-ui-font-medium text-ui-accent-fg hover:bg-ui-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2"
          >
            + New account
          </Link>
        }
      />
      <AccountsListTable accounts={body.data} lastActivityIncluded={lastActivityIncluded} />
    </PageContainer>
  );
}
