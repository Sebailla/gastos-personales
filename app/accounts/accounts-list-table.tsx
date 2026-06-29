'use client';

/**
 * AccountsListTable — Client Component production render.
 *
 * Per design §15.2 + REQ-UI-7 + REQ-UI-8:
 * - Sorts by name (default ASC), currency, or last activity.
 * - Renders an `aria-sort` reflecting the current sort
 *   direction per REQ-UI-8.
 * - Hosts a "Show archived" toggle (default OFF) that filters
 *   out rows where `archivedAt !== null`.
 * - Renders the `lastActivityAt` column from the
 *   `?include=lastActivity` query flag. The flag is OPTIONAL;
 *   when the page fetches WITHOUT the flag, the wire response
 *   has no `lastActivityAt` field on the rows — the consumer
 *   signals `lastActivityIncluded={false}` (default) and the
 *   table hides the column entirely. When `lastActivityIncluded`
 *   is `true`, the column renders with `—` for null values.
 * - Empty list renders an `EmptyState` with a CTA to
 *   `/accounts/new`.
 * - Uses the design-system `Table` compound primitive; all
 *   a11y wiring (caption, scope, aria-sort) lives in the
 *   primitive.
 *
 * The component does NOT own pagination; the parent page
 * passes `accounts` and the parent decides whether to
 * mount the `Pagination` primitive.
 */

import { useMemo, useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '../_ui/primitives/table';
import { Badge } from '../_ui/primitives/badge';
import { EmptyState } from '../_ui/primitives/empty-state';
import { Link } from '../_ui/primitives/link';
import type { FinancialAccountWire } from '../_lib/account-types';

type SortKey = 'name' | 'currency' | 'lastActivityAt';
type SortDir = 'asc' | 'desc';

export interface AccountsListTableProps {
  accounts: ReadonlyArray<FinancialAccountWire>;
  /**
   * When `true`, the parent fetched with
   * `?include=lastActivity` and the rows carry a
   * `lastActivityAt` field. When `false` (default), the
   * column is hidden entirely (the field is undefined on
   * the wire response).
   */
  lastActivityIncluded?: boolean;
}

function compareNullable(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: SortDir,
): number {
  // Nulls always sort to the bottom regardless of direction
  // so the user sees real data first; a pure localeCompare
  // would scatter nulls.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
}

function nextDir(current: SortDir): SortDir {
  return current === 'asc' ? 'desc' : 'asc';
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Render the date only (YYYY-MM-DD) so the column matches
  // the existing AccountDetail pattern.
  return iso.slice(0, 10);
}

export function AccountsListTable({
  accounts,
  lastActivityIncluded = false,
}: AccountsListTableProps): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  const filtered = useMemo(
    () => (showArchived ? accounts : accounts.filter((a) => a.archivedAt === null)),
    [accounts, showArchived],
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (sortKey === 'lastActivityAt') {
          return compareNullable(a.lastActivityAt, b.lastActivityAt, sortDir);
        }
        if (sortKey === 'currency') {
          return compareNullable(a.currency, b.currency, sortDir);
        }
        return compareNullable(a.name, b.name, sortDir);
      }),
    [filtered, sortKey, sortDir],
  );

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      sortDirection:
        sortKey === 'name' ? (sortDir === 'asc' ? ('ascending' as const) : ('descending' as const)) : ('none' as const),
      onSort: () => {
        setSortKey('name');
        setSortDir((d) => (sortKey === 'name' ? nextDir(d) : 'asc'));
      },
    },
    {
      key: 'currency',
      label: 'Currency',
      sortable: true,
      sortDirection:
        sortKey === 'currency'
          ? sortDir === 'asc'
            ? ('ascending' as const)
            : ('descending' as const)
          : ('none' as const),
      onSort: () => {
        setSortKey('currency');
        setSortDir((d) => (sortKey === 'currency' ? nextDir(d) : 'asc'));
      },
    },
    ...(lastActivityIncluded
      ? [
          {
            key: 'lastActivityAt',
            label: 'Last activity',
            sortable: true,
            sortDirection:
              sortKey === 'lastActivityAt'
                ? sortDir === 'asc'
                  ? ('ascending' as const)
                  : ('descending' as const)
                : ('none' as const),
            onSort: () => {
              setSortKey('lastActivityAt');
              setSortDir((d) => (sortKey === 'lastActivityAt' ? nextDir(d) : 'asc'));
            },
          },
        ]
      : []),
    { key: 'archived', label: 'Archived' },
  ];

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No accounts yet"
        description="Create your first account to start recording transactions."
        cta={
          <Link href="/accounts/new" className="text-ui-text-sm font-ui-font-medium text-ui-accent hover:underline">
            + New account
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-ui-space-3">
      <label className="inline-flex items-center gap-ui-space-2 text-ui-text-sm text-ui-fg">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          aria-label="Show archived"
        />
        Show archived
      </label>
      <Table caption="Accounts list" hideCaption>
        <TableHeader columns={columns} />
        <TableBody>
          {sorted.map((account) => (
            <TableRow key={account.id}>
              <TableCell>
                <Link
                  href={`/accounts/${account.id}`}
                  className="text-ui-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent rounded-ui-sm"
                >
                  {account.name}
                </Link>
              </TableCell>
              <TableCell>{account.currency}</TableCell>
              {lastActivityIncluded ? (
                <TableCell>{formatDate(account.lastActivityAt)}</TableCell>
              ) : null}
              <TableCell>
                {account.archivedAt !== null ? (
                  <Badge variant="neutral">Archived</Badge>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
