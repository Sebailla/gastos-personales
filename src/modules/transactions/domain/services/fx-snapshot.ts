import { AccountCurrency, AccountFxCasa } from '../entities/transaction';
import type { FxRateProvider } from '../interfaces/fx-rate-provider.port';

/**
 * FX snapshot helper: `convertAndSnapshot`.
 *
 * Slice 2 binding. The helper takes the native amount, the native
 * currency, the parent account's casa, and an `FxRateProvider`,
 * and returns the four snapshot fields the factory stamps on the
 * `Transaction` row:
 *
 *   `{ convertedAmountMinor, convertedCurrency, fxAsOfSnapshot, casa }`
 *
 * Two paths:
 *
 *  - **Skip path (BR-TX-6)** — when the native currency equals
 *    the casa's currency, no FX call is issued. The native
 *    amount is mirrored as the converted amount; the snapshot
 *    timestamp is `null`; the snapshot casa is `null`.
 *  - **Call path** — when the currencies differ, the helper
 *    calls `FxRateProvider.getDisplayAmount(...)` once, with the
 *    resolved casa and the injected `now` as `asOf`. The result
 *    is returned verbatim. The provider's `stale` flag is
 *    dropped at this layer (per BR-ACC-13 carried; the snapshot
 *    timestamp is the surface).
 *
 * Half-up rounding (DG-TX-8) is the `FxRateProvider`'s contract
 * — the helper does NOT re-round. The provider returns integer
 * minor units; the helper stamps them verbatim. See
 * `fx-rate-provider.dolar-api.ts` comments for the rounding
 * convention.
 *
 * Casa resolution (BR-FX-3) is the caller's responsibility. The
 * factory resolves `account.casa ?? env.FX_DEFAULT_CASA` before
 * calling this helper; this helper does NOT consult env.
 */

/**
 * Lowercase DolarAPI casa string. Mirrored locally to avoid
 * importing the private `FX_CASAS` const from `accounts`'s
 * internal port module; the slice spec and the design §5.1
 * agree on this mirror approach (modules-isolated rule, root
 * AGENTS.md §10.5).
 */
export type FxCasaString = 'oficial' | 'blue' | 'mep' | 'ccl' | 'cripto' | 'tarjeta';

/** Casa → peer currency. v1: every DolarAPI casa is ARS. */
export function currencyForCasa(_casa: AccountFxCasa): AccountCurrency {
  // All DolarAPI-supported casas are ARS↔USD in v1. EUR support
  // is the v1.1 follow-up (design §5.1 casaCurrencyFor comment).
  return AccountCurrency.ARS;
}

/** UPPERCASE `AccountFxCasa` → lowercase DolarAPI `FxCasaString`. */
const CASA_TO_LOWERCASE: Record<AccountFxCasa, FxCasaString> = {
  OFICIAL: 'oficial',
  BLUE: 'blue',
  MEP: 'mep',
  CCL: 'ccl',
  CRIPTO: 'cripto',
  TARJETA: 'tarjeta',
};

export interface ConvertAndSnapshotInput {
  readonly originalAmountMinor: number;
  readonly originalCurrency: AccountCurrency;
  readonly casa: AccountFxCasa;
  readonly fxRateProvider: FxRateProvider;
  /** Injected clock. Default: `new Date()`. Tests inject a fixed value for determinism. */
  readonly now?: Date;
}

export interface FxSnapshot {
  readonly convertedAmountMinor: number;
  readonly convertedCurrency: AccountCurrency;
  readonly fxAsOfSnapshot: Date | null;
  readonly casa: AccountFxCasa;
}

/**
 * Convert the native amount to the casa's currency and snapshot
 * the FX metadata. Pure function modulo the FX call.
 *
 * Throws whatever the provider throws (e.g.
 * `AppError(FX_UNAVAILABLE)`) — the helper does NOT swallow
 * provider failures. The caller (action layer) maps the
 * provider's `AppError` to the wire status.
 */
export async function convertAndSnapshot(input: ConvertAndSnapshotInput): Promise<FxSnapshot> {
  const casaLower = CASA_TO_LOWERCASE[input.casa];
  const casaCurrency = currencyForCasa(input.casa);

  // BR-TX-6: skip the FX call when native currency == casa currency.
  if (input.originalCurrency === casaCurrency) {
    return {
      convertedAmountMinor: input.originalAmountMinor,
      convertedCurrency: input.originalCurrency,
      fxAsOfSnapshot: null,
      casa: input.casa,
    };
  }

  // Call path: issue exactly one FX call.
  const result = await input.fxRateProvider.getDisplayAmount({
    native: { amount: input.originalAmountMinor, currency: input.originalCurrency },
    displayCurrency: casaCurrency,
    asOf: input.now ?? new Date(),
    casa: casaLower,
  });

  return {
    convertedAmountMinor: result.display.amount,
    convertedCurrency: result.display.currency,
    fxAsOfSnapshot: result.display.fxAsOf,
    casa: input.casa,
  };
}
