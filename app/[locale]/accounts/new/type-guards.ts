/**
 * Type guards for CreateAccountForm field narrowing.
 *
 * Root AGENTS.md §10.5 forbids unsafe `e.target.value as T` casts
 * because they let any DOM string pass the type-checker. Each
 * guard below validates the runtime string against the literal
 * union it claims to be, then narrows. The form uses these in the
 * `onChange` handler of each `<Select>` so a malformed value
 * (browser extension, programmatic event, etc.) cannot poison
 * the form state.
 *
 * Pattern precedent: `app/_components/transactions-list-table.tsx`
 * `isDirection(value: string): value is Direction`.
 *
 * The default-fallback contract: every `parseX(value, fallback)`
 * returns the fallback when `value` is empty OR fails the guard.
 * The form passes the existing `useState` initializer as the
 * fallback so we never reset the form to a different default on
 * a noisy event.
 */

export const TYPES = ['BANK', 'CREDIT', 'INVESTMENT', 'CRYPTO', 'CASH', 'OTHER'] as const;
export const CURRENCIES = ['ARS', 'USD', 'EUR'] as const;
export const ACCOUNT_KINDS = ['SAVINGS', 'CHECKING'] as const;
export const INVESTMENT_TYPES = [
  'STOCKS',
  'BONDS',
  'MUTUAL_FUNDS',
  'CERTS_OF_DEPOSIT',
  'OTHER',
] as const;
export const CASAS = ['OFICIAL', 'BLUE', 'MEP', 'CCL', 'CRIPTO', 'TARJETA'] as const;
export const OPENING_BALANCE_MODES = ['FRESH', 'HISTORICAL'] as const;

export type AccountType = (typeof TYPES)[number];
export type AccountCurrency = (typeof CURRENCIES)[number];
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];
export type Casa = (typeof CASAS)[number];
export type OpeningBalanceMode = (typeof OPENING_BALANCE_MODES)[number];

export function isAccountType(v: string): v is AccountType {
  return (TYPES as ReadonlyArray<string>).includes(v);
}

export function isAccountCurrency(v: string): v is AccountCurrency {
  return (CURRENCIES as ReadonlyArray<string>).includes(v);
}

export function isAccountKind(v: string): v is AccountKind {
  return (ACCOUNT_KINDS as ReadonlyArray<string>).includes(v);
}

export function isInvestmentType(v: string): v is InvestmentType {
  return (INVESTMENT_TYPES as ReadonlyArray<string>).includes(v);
}

export function isCasa(v: string): v is Casa {
  return (CASAS as ReadonlyArray<string>).includes(v);
}

export function isOpeningBalanceMode(v: string): v is OpeningBalanceMode {
  return (OPENING_BALANCE_MODES as ReadonlyArray<string>).includes(v);
}

/**
 * `parseX(value, fallback)` — combines guard + fallback so the
 * form's `onChange` stays a single-line expression. An empty
 * string (the Select's "Default" sentinel for `casa`) returns
 * the fallback unless the caller explicitly passes
 * `parseCasaOrNull` (see below).
 */
export function parseAccountType(v: string, fallback: AccountType): AccountType {
  return isAccountType(v) ? v : fallback;
}

export function parseAccountCurrency(v: string, fallback: AccountCurrency): AccountCurrency {
  return isAccountCurrency(v) ? v : fallback;
}

export function parseAccountKind(v: string, fallback: AccountKind): AccountKind {
  return isAccountKind(v) ? v : fallback;
}

export function parseInvestmentType(v: string, fallback: InvestmentType): InvestmentType {
  return isInvestmentType(v) ? v : fallback;
}

/**
 * The casa `<Select>` has a "Default (oficial)" sentinel with
 * value `''`. The form stores `null` for that case (REQ-FX-9:
 * inherit the global default). Empty string → null; valid casa
 * → Casa; invalid string → null (defense-in-depth fallback).
 */
export function parseCasaOrNull(v: string): Casa | null {
  if (v === '') return null;
  return isCasa(v) ? v : null;
}

export function parseOpeningBalanceMode(
  v: string,
  fallback: OpeningBalanceMode,
): OpeningBalanceMode {
  return isOpeningBalanceMode(v) ? v : fallback;
}
