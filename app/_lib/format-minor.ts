/**
 * Currency formatting helpers — shared between the
 * accounts list, account detail, and balance widget.
 *
 * `CURRENCY_SYMBOLS` is a fixed whitelist
 * `{ ARS, USD, EUR }` that mirrors the API's
 * `AccountCurrency` enum. Unknown currencies fall back
 * to the ISO code itself (no symbol lookup, no
 * Intl.NumberFormat — the smoke UI keeps it explicit).
 *
 * `formatMinor` renders a minor-units integer as a
 * two-decimal string prefixed by the symbol. Negative
 * amounts render as e.g. `US$-12.34` (sign inside the
 * amount, outside the symbol) which matches the smoke
 * UI's hand-verified expectation.
 *
 * Kept in `app/_lib/` so the UI does not reach into
 * the accounts module for a presentation helper
 * (architecture-standards rule: UI does not import
 * domain/application for formatting concerns).
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  ARS: '$',
  USD: 'US$',
  EUR: '€',
};

export function formatMinor(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol}${(amount / 100).toFixed(2)}`;
}
