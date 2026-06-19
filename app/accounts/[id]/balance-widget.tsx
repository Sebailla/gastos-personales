// smoke-minimal, not production
'use client';

/**
 * BalanceWidget — Client Component.
 *
 * BR-ACC-18 (balance widget contract):
 * - Native balance is always rendered (even after a
 *   conversion).
 * - The `<select name="displayCurrency">` carries the full
 *   whitelist `{ ARS, USD, EUR }`. No native-currency
 *   filtering.
 * - On submit, calls
 *   `GET /api/accounts/:id/balance?displayCurrency=<selected>`
 *   via plain `fetch` (same-origin).
 * - On `200`, renders `display.amount`, `display.fxRate`,
 *   and `display.fxAsOf` as "Last updated: <ISO>".
 * - On `503 FX_UNAVAILABLE`: inline error
 *   "FX rate provider unavailable. Try again in a few
 *   minutes."
 * - On `409 FX_NOT_SUPPORTED`: inline error
 *   "FX conversion not supported for this pair."
 * - On `5xx` / network error: inline error
 *   "Something went wrong".
 * - Calls `router.refresh()` after a successful response
 *   so the page re-reads the account.
 *
 * The native balance is passed in as a prop from the
 * Server Component (no client-side fetch for the row).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FinancialAccountBalanceWire } from '../../_lib/account-types';
import { formatMinor } from '../../_lib/format-minor';

const CURRENCIES = ['ARS', 'USD', 'EUR'] as const;
type DisplayCurrency = (typeof CURRENCIES)[number];

interface Props {
  accountId: string;
  nativeAmount: number;
  nativeCurrency: DisplayCurrency;
}

export function BalanceWidget({
  accountId,
  nativeAmount,
  nativeCurrency,
}: Props) {
  const router = useRouter();
  const [displayCurrency, setDisplayCurrency] =
    useState<DisplayCurrency>(nativeCurrency);
  const [result, setResult] = useState<FinancialAccountBalanceWire['display'] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/balance?displayCurrency=${displayCurrency}`,
        { method: 'GET' },
      );
      if (res.ok) {
        const body = (await res.json()) as { data: FinancialAccountBalanceWire };
        setResult(body.data.display);
        router.refresh();
        return;
      }
      // Map known error codes to user-facing copy. Anything
      // else falls back to the response's `error.message` or
      // a generic "Something went wrong".
      const errBody = (await res.json().catch(() => null)) as
        | { error: { code: string; message: string } }
        | null;
      if (errBody?.error?.code === 'FX_UNAVAILABLE') {
        setError('FX rate provider unavailable. Try again in a few minutes.');
      } else if (errBody?.error?.code === 'FX_NOT_SUPPORTED') {
        setError('FX conversion not supported for this pair.');
      } else {
        setError(
          errBody?.error?.message ?? `balance failed (${res.status})`,
        );
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 border-t pt-4">
      <h2 className="text-lg font-semibold mb-2">Balance</h2>
      <p className="mb-3">
        Native:{' '}
        <span className="font-mono">
          {formatMinor(nativeAmount, nativeCurrency)}
        </span>
      </p>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label className="block">
          <span className="block text-sm">Display in</span>
          <select
            name="displayCurrency"
            value={displayCurrency}
            onChange={(e) => setDisplayCurrency(e.target.value as DisplayCurrency)}
            className="border border-gray-300 rounded px-2 py-1"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 text-white px-3 py-1 disabled:opacity-50"
        >
          {loading ? 'Converting…' : 'Convert'}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded border border-red-300 bg-red-50 text-red-800 px-3 py-2"
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p>
            Display:{' '}
            <span className="font-mono">
              {formatMinor(result.amount, result.currency)}
            </span>{' '}
            <span className="text-sm text-gray-600">
              @ {result.fxRate.toFixed(4)}
            </span>
          </p>
          <p className="text-sm text-gray-600">
            Last updated: {result.fxAsOf}
          </p>
        </div>
      ) : null}
    </section>
  );
}
