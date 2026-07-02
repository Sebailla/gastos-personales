/**
 * AccountDetail — production render Server Component.
 *
 * Per design §7.3 the detail renders a Card compound:
 * - CardHeader with the account name as the title, the
 *   currency as a Badge, and the Archived badge when
 *   `archivedAt !== null`.
 * - CardBody with a key-value grid for currency / opening
 *   balance / casa / createdAt (the type-specific fields
 *   that the smoke version rendered are deferred to the
 *   edit form slice; the production detail focuses on the
 *   summary view).
 * - CardFooter with an Edit link (`/accounts/[id]/edit`) and
 *   an Archive button (Server Action stub — the full archive
 *   flow lands in a follow-up; the button is a visible
 *   placeholder for now).
 *
 * The component is a Server Component (no Client hooks). It
 * accepts a `FinancialAccountWire` from the parent page.
 */

import { Card, CardHeader, CardBody, CardFooter } from '../../../_ui/primitives/card';
import { Badge } from '../../../_ui/primitives/badge';
import { Link } from '../../../_ui/primitives/link';
import type { FinancialAccountWire } from '../../../_lib/account-types';
import { formatMinor } from '../../../_lib/format-minor';

interface Props {
  account: FinancialAccountWire;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function AccountDetail({ account }: Props): React.JSX.Element {
  const isArchived = account.archivedAt !== null;
  return (
    <Card aria-label={`Account ${account.name}`}>
      <CardHeader
        title={account.name}
        badge={
          <>
            <Badge variant="neutral">{account.currency}</Badge>
            {isArchived ? <Badge variant="warning">Archived</Badge> : null}
          </>
        }
      />
      <CardBody>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-ui-space-6 gap-y-ui-space-2 text-ui-text-sm">
          <dt className="font-ui-font-semibold text-ui-fg">Currency</dt>
          <dd className="text-ui-fg">{account.currency}</dd>

          <dt className="font-ui-font-semibold text-ui-fg">Opening balance</dt>
          <dd className="font-mono text-ui-fg">
            {formatMinor(account.openingBalanceMinor, account.currency)} (
            {account.openingBalanceMode}
            {account.openingBalanceMode === 'HISTORICAL'
              ? `, on ${formatDate(account.openingBalanceDate)}`
              : ''}
            )
          </dd>

          <dt className="font-ui-font-semibold text-ui-fg">Created at</dt>
          <dd className="text-ui-fg">{formatDate(account.createdAt)}</dd>
        </dl>
      </CardBody>
      <CardFooter>
        <Link
          href={`/accounts/${account.id}/edit`}
          className="rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-fg hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent"
        >
          Edit
        </Link>
        {isArchived ? (
          <button
            type="button"
            disabled
            aria-label="Archive account (placeholder)"
            className="rounded-ui-md bg-ui-bg-muted px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-fg-muted opacity-50 cursor-not-allowed"
            title="Archive flow lands in a follow-up slice"
          >
            Archived
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Archive account (placeholder)"
            className="rounded-ui-md bg-ui-bg-muted px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-fg-muted opacity-50 cursor-not-allowed"
            title="Archive flow lands in a follow-up slice"
          >
            Archive
          </button>
        )}
      </CardFooter>
    </Card>
  );
}
