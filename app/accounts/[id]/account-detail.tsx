/**
 * AccountDetail — pure render Server Component.
 *
 * Renders the full account row in a `<dl>` (description
 * list) for the detail page. Type-specific fields are
 * rendered conditionally based on the account's `type`.
 * The balance widget (Client Component) is rendered below
 * the row in the parent page.
 *
 * The "Opening balance" row shows the mode + date
 * (FRESH → no date; HISTORICAL → back-dated to the date).
 */

import type { FinancialAccountWire } from '../../_lib/account-types';

interface Props {
  account: FinancialAccountWire;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  ARS: '$',
  USD: 'US$',
  EUR: '€',
};

function formatMinor(amountMinor: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol}${(amountMinor / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  // Render the date only (YYYY-MM-DD) to avoid the
  // "Last updated: <ISO>" UX surprise on a static field.
  return iso.slice(0, 10);
}

export function AccountDetail({ account }: Props) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
      <dt className="font-semibold">Name</dt>
      <dd>{account.name}</dd>

      <dt className="font-semibold">Type</dt>
      <dd>{account.type}</dd>

      <dt className="font-semibold">Currency</dt>
      <dd>{account.currency}</dd>

      <dt className="font-semibold">Opening balance</dt>
      <dd className="font-mono">
        {formatMinor(account.openingBalanceMinor, account.currency)} (
        {account.openingBalanceMode}
        {account.openingBalanceMode === 'HISTORICAL'
          ? `, on ${formatDate(account.openingBalanceDate)}`
          : ''}
        )
      </dd>

      {account.type === 'BANK' ? (
        <>
          <dt className="font-semibold">Bank name</dt>
          <dd>{account.bankName ?? '—'}</dd>
          <dt className="font-semibold">Account kind</dt>
          <dd>{account.accountKind ?? '—'}</dd>
        </>
      ) : null}

      {account.type === 'CREDIT' ? (
        <>
          <dt className="font-semibold">Issuer</dt>
          <dd>{account.issuer ?? '—'}</dd>
          <dt className="font-semibold">Credit limit</dt>
          <dd className="font-mono">
            {account.creditLimitMinor !== null
              ? formatMinor(account.creditLimitMinor, account.currency)
              : '—'}
          </dd>
          <dt className="font-semibold">Statement day</dt>
          <dd>{account.statementDay ?? '—'}</dd>
          <dt className="font-semibold">Payment due day</dt>
          <dd>{account.paymentDueDay ?? '—'}</dd>
        </>
      ) : null}

      {account.type === 'INVESTMENT' ? (
        <>
          <dt className="font-semibold">Broker</dt>
          <dd>{account.broker ?? '—'}</dd>
          <dt className="font-semibold">Investment type</dt>
          <dd>{account.investmentType ?? '—'}</dd>
        </>
      ) : null}

      {account.type === 'CRYPTO' ? (
        <>
          <dt className="font-semibold">Wallet address</dt>
          <dd className="font-mono break-all">
            {account.walletAddress ?? '—'}
          </dd>
        </>
      ) : null}

      <dt className="font-semibold">Created at</dt>
      <dd>{formatDate(account.createdAt)}</dd>
    </dl>
  );
}
