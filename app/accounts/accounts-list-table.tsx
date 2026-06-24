// smoke-minimal, not production
/**
 * AccountsListTable — pure render Server Component.
 *
 * Renders a `<table>` with the columns the spec requires
 * (Name, Type, Currency, Opening balance). The truncation
 * footer ("Showing first 50 of N") renders only when
 * `total > accounts.length` (i.e. the API's default
 * `limit=50` truncated the result set).
 *
 * The link from each row goes to `/accounts/[id]`; the
 * detail page handles cross-user / 404 / FX.
 *
 * No interactive state, no client hooks. The whole table
 * is rendered server-side from the Server Component's
 * initial data fetch (see `app/accounts/page.tsx`).
 */

import Link from 'next/link';
import type { FinancialAccountWire } from '../_lib/account-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  accounts: FinancialAccountWire[];
  total: number;
}

export function AccountsListTable({ accounts, total }: Props) {
  return (
    <>
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-3 py-2 text-left">Name</th>
            <th className="border border-gray-300 px-3 py-2 text-left">Type</th>
            <th className="border border-gray-300 px-3 py-2 text-left">Currency</th>
            <th className="border border-gray-300 px-3 py-2 text-left">Opening balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50">
              <td className="border border-gray-300 px-3 py-2">
                <Link
                  href={`/accounts/${a.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {a.name}
                </Link>
              </td>
              <td className="border border-gray-300 px-3 py-2">{a.type}</td>
              <td className="border border-gray-300 px-3 py-2">{a.currency}</td>
              <td className="border border-gray-300 px-3 py-2 font-mono">
                {formatMinor(a.openingBalanceMinor, a.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > accounts.length ? (
        <p className="mt-3 text-sm text-gray-600">
          Showing first {accounts.length} of {total}
        </p>
      ) : null}
    </>
  );
}
