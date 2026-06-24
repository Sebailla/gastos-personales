// smoke-minimal, not production
/**
 * TransactionsListTable — pure render Server Component.
 *
 * Renders a `<table>` with the columns the spec REQ-TX-15
 * requires: Date, Direction, Amount, Converted amount,
 * Currency. The link from each row goes to
 * `/transactions/[id]`. The "Showing first 50 of N" footer
 * renders only when `hasMore === true` (i.e. the API's
 * default `limit=50` truncated the result set and a
 * `nextCursor` is present).
 *
 * The `convertedAmountMinor` + `convertedCurrency` columns
 * surface the FX snapshot at write time (BR-ACC-12). The
 * smoke UI does not display the FX timestamp in the table
 * row (the detail page does — see `app/transactions/[id]/page.tsx`).
 *
 * No interactive state, no client hooks. The whole table
 * is rendered server-side from the Server Component's
 * initial data fetch.
 */

import Link from 'next/link';
import type { TransactionWire } from '../_lib/transaction-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  transactions: TransactionWire[];
  hasMore: boolean;
}

export function TransactionsListTable({ transactions, hasMore }: Props) {
  return (
    <>
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-3 py-2 text-left">Date</th>
            <th className="border border-gray-300 px-3 py-2 text-left">Direction</th>
            <th className="border border-gray-300 px-3 py-2 text-left">Amount</th>
            <th className="border border-gray-300 px-3 py-2 text-left">Converted</th>
            <th className="border border-gray-300 px-3 py-2 text-left">Account</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="hover:bg-gray-50">
              <td className="border border-gray-300 px-3 py-2">
                <Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">
                  {t.transactionDate.slice(0, 10)}
                </Link>
              </td>
              <td className="border border-gray-300 px-3 py-2">{t.direction}</td>
              <td className="border border-gray-300 px-3 py-2 font-mono">
                {formatMinor(t.amountMinor, t.currency)}
              </td>
              <td className="border border-gray-300 px-3 py-2 font-mono">
                {formatMinor(t.convertedAmountMinor, t.convertedCurrency)}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-xs text-gray-600">
                {t.accountId.slice(0, 8)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore ? (
        <p className="mt-3 text-sm text-gray-600">
          Showing first {transactions.length}; more available
        </p>
      ) : null}
    </>
  );
}
