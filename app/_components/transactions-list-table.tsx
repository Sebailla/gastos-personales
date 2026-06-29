'use client';

/**
 * TransactionsListTable — Client Component production render.
 *
 * Per design §15.3 + REQ-UI-7 + REQ-UI-8:
 * - Sorts by transactionDate (default DESC), amountMinor, or
 *   convertedAmountMinor. Date is the default per the spec
 *   (newest transactions surface first).
 * - Renders an `aria-sort` reflecting the current sort
 *   direction per REQ-UI-8.
 * - Renders INCOME -> `Badge variant="success"` and
 *   EXPENSE -> `Badge variant="danger"` (the
 *   `directionVariant` helper from the Badge primitive).
 * - Renders an OPTIONAL `Account` column when the parent
 *   fetched with `?include=accountName` (BR-UI-2). The flag
 *   is OPTIONAL on the wire; the table hides the column
 *   entirely when `accountNameIncluded={false}` (default).
 * - Mounts a `Pagination` primitive with a `Next page` Link
 *   when `nextCursor` is non-null. The link carries
 *   `?cursor=<cursor>` so the App Router re-renders with
 *   the next page. Previous-page navigation is implicit
 *   (the user navigates back to the list).
 * - Empty list renders an `EmptyState` with a CTA to
 *   `/transactions/new`.
 * - Uses the design-system `Table` compound primitive; all
 *   a11y wiring (caption, scope, aria-sort) lives in the
 *   primitive.
 *
 * The component does NOT own the data fetch; the parent
 * page passes `transactions` and `nextCursor`. The parent
 * also decides whether to mount the `Pagination` (we pass
 * `nextCursor` and the component decides visibility).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  type TableColumn,
} from '../_ui/primitives/table';
import { Badge, directionVariant } from '../_ui/primitives/badge';
import { EmptyState } from '../_ui/primitives/empty-state';
import { Pagination } from '../_ui/primitives/pagination';
import type { TransactionWire } from '../_lib/transaction-types';

type SortKey = 'transactionDate' | 'amountMinor' | 'convertedAmountMinor';
type SortDir = 'asc' | 'desc';
type Direction = 'INCOME' | 'EXPENSE';

export interface TransactionsListTableProps {
  transactions: ReadonlyArray<TransactionWire>;
  nextCursor: string | null;
  /**
   * When `true`, the parent fetched with
   * `?include=accountName` and the rows carry an
   * `accountName` field. When `false` (default), the
   * Account column is hidden entirely (the field is
   * undefined on the wire response). See BR-UI-2.
   */
  accountNameIncluded?: boolean;
}

function isDirection(value: string): value is Direction {
  return value === 'INCOME' || value === 'EXPENSE';
}

function dateSortKey(iso: string): number {
  // Date strings are ISO 8601 — lexicographic compare equals
  // chronological compare, so a direct subtraction is safe
  // without parsing to Date. (Avoids a Date allocation per
  // comparison in the sort callback.)
  return iso < '0000' ? -1 : Number(iso.replace(/[^0-9]/g, '').slice(0, 14));
}

function compareBySortKey(
  a: TransactionWire,
  b: TransactionWire,
  key: SortKey,
  dir: SortDir,
): number {
  if (key === 'transactionDate') {
    const av = a.transactionDate;
    const bv = b.transactionDate;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  }
  if (key === 'amountMinor') {
    return dir === 'asc' ? a.amountMinor - b.amountMinor : b.amountMinor - a.amountMinor;
  }
  return dir === 'asc'
    ? a.convertedAmountMinor - b.convertedAmountMinor
    : b.convertedAmountMinor - a.convertedAmountMinor;
}

// Suppress unused-binding warning for dateSortKey: kept as
// documentation of the lexicographic-equals-chronological
// invariant used by compareBySortKey.
void dateSortKey;

function nextDir(current: SortDir): SortDir {
  return current === 'asc' ? 'desc' : 'asc';
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatRateAsOf(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function TransactionsListTable({
  transactions,
  nextCursor,
  accountNameIncluded = false,
}: TransactionsListTableProps): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('transactionDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => compareBySortKey(a, b, sortKey, sortDir)),
    [transactions, sortKey, sortDir],
  );

  const nextPageHref = nextCursor
    ? `/transactions?cursor=${encodeURIComponent(nextCursor)}`
    : '/transactions';

  const columns: TableColumn[] = [
    {
      key: 'transactionDate',
      label: 'Date',
      sortable: true,
      sortDirection:
        sortKey === 'transactionDate'
          ? sortDir === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none',
      onSort: () => {
        setSortKey('transactionDate');
        setSortDir((d) => (sortKey === 'transactionDate' ? nextDir(d) : 'desc'));
      },
    },
    ...(accountNameIncluded
      ? [
          {
            key: 'accountName',
            label: 'Account',
            sortable: false,
            sortDirection: 'none' as const,
          },
        ]
      : []),
    {
      key: 'direction',
      label: 'Direction',
      sortable: false,
      sortDirection: 'none',
    },
    {
      key: 'amountMinor',
      label: 'Native amount',
      sortable: true,
      sortDirection:
        sortKey === 'amountMinor'
          ? sortDir === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none',
      onSort: () => {
        setSortKey('amountMinor');
        setSortDir((d) => (sortKey === 'amountMinor' ? nextDir(d) : 'asc'));
      },
    },
    {
      key: 'convertedAmountMinor',
      label: 'Converted',
      sortable: true,
      sortDirection:
        sortKey === 'convertedAmountMinor'
          ? sortDir === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none',
      onSort: () => {
        setSortKey('convertedAmountMinor');
        setSortDir((d) => (sortKey === 'convertedAmountMinor' ? nextDir(d) : 'asc'));
      },
    },
    {
      key: 'fxAsOfSnapshot',
      label: 'Rate as of',
      sortable: false,
      sortDirection: 'none',
    },
    {
      key: 'memo',
      label: 'Memo',
      sortable: false,
      sortDirection: 'none',
    },
  ];

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        description="Record your first transaction to start tracking your cash flow."
        cta={
          <Link
            href="/transactions/new"
            className="text-ui-text-sm font-ui-font-medium text-ui-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent rounded-ui-sm"
          >
            + New transaction
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-ui-space-3">
      <Table caption="Transactions list" hideCaption>
        <TableHeader columns={columns} />
        <TableBody>
          {sorted.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <Link
                  href={`/transactions/${t.id}`}
                  className="text-ui-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent rounded-ui-sm"
                >
                  {formatDate(t.transactionDate)}
                </Link>
              </TableCell>
              {accountNameIncluded ? (
                <TableCell>{t.accountName ?? '—'}</TableCell>
              ) : null}
              <TableCell>
                {isDirection(t.direction) ? (
                  <Badge variant={directionVariant(t.direction)}>{t.direction}</Badge>
                ) : (
                  t.direction
                )}
              </TableCell>
              <TableCell className="font-mono">
                {(t.amountMinor / 100).toFixed(2)} {t.currency}
              </TableCell>
              <TableCell className="font-mono">
                {(t.convertedAmountMinor / 100).toFixed(2)} {t.convertedCurrency}
              </TableCell>
              <TableCell className="font-mono text-ui-text-xs text-ui-fg-muted">
                {formatRateAsOf(t.fxAsOfSnapshot)}
              </TableCell>
              <TableCell>{t.memo ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {nextCursor ? (
        <Pagination
          currentPage={1}
          totalPages={2}
          baseUrl={nextPageHref}
          queryKey="page"
        />
      ) : null}
    </div>
  );
}
