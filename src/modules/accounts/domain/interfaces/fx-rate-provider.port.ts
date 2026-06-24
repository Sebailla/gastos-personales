/**
 * Port: FxRateProvider.
 *
 * Read-only foreign-exchange conversion for the
 * `GET /api/accounts/:id/balance?displayCurrency=…` endpoint.
 * Declared in this change; the implementation lands in the
 * separate `fx-cache` change (PR-B's `FxRateProviderUnconfigured`
 * is the in-change stub that always returns 503).
 *
 * Per BR-ACC-12: storage is never converted. The provider
 * converts at read time and surfaces the rate's `fxAsOf` so a
 * caller can judge freshness. Per BR-ACC-13: stale is not a
 * 5xx; the provider returns the rate with `fxAsOf` even when
 * older than the freshness window.
 *
 * Per REQ-FX-3 (fx-cache PR-3 T3.1): the provider MUST receive
 * a fully-resolved `casa` on every call. The provider does
 * NOT consult `process.env.FX_DEFAULT_CASA` and does NOT
 * query the `FinancialAccount.casa` column — the caller (the
 * `get-account-balance.action.ts` layer) resolves
 * `account.casa ?? env.FX_DEFAULT_CASA` at the action site
 * and forwards the result. This is encoded at the type level
 * (the field is required, not optional).
 *
 * Errors (caught by the application layer and mapped to
 * HTTP statuses):
 * - `AppError(FX_UNAVAILABLE, 503)` — the provider cannot
 *   respond (no impl registered, network failure, etc.).
 * - `AppError(FX_NOT_SUPPORTED, 409)` — the configured
 *   provider does not support the requested pair.
 */

import type { AccountCurrency } from '../entities/financial-account';

/**
 * Lowercase DolarAPI casa enum. The DolarAPI wire format is
 * lowercase (`/dolares/oficial`); the Prisma `AccountFxCasa`
 * enum is UPPERCASE per Prisma convention. This tuple is the
 * structural source of truth for the lowercase form on the
 * accounts side; the canonical Zod schema lives in
 * `@/modules/fx` (`fx-casa-string.schema.ts`). The two MUST
 * stay in sync — drift fails the parse test in
 * `env.schema.test.ts` and the runtime provider assertion in
 * `fx-rate-provider.dolar-api.test.ts`.
 *
 * Why this is duplicated rather than re-exported from `@/modules/fx`:
 * the `accounts` module MUST NOT import from `fx` (the modules
 * isolated rule, root `AGENTS.md` §10.5). A structural tuple
 * costs ~6 lines and survives without creating a reverse
 * dependency.
 */
export const FX_CASAS = ['oficial', 'blue', 'mep', 'ccl', 'cripto', 'tarjeta'] as const;
export type FxCasaString = (typeof FX_CASAS)[number];

export interface FxConversionRequest {
  readonly native: {
    readonly amount: number; // minor units (cents)
    readonly currency: AccountCurrency;
  };
  readonly displayCurrency: AccountCurrency;
  readonly asOf: Date;
  /**
   * The fully-resolved lowercase DolarAPI casa for this
   * conversion. The caller (the action layer) MUST resolve
   * `account.casa ?? env.FX_DEFAULT_CASA` and forward the
   * result; the provider itself MUST NOT read env or query
   * the database. Locked at the type level — see
   * `fx-rate-provider.port.test.ts`.
   */
  readonly casa: FxCasaString;
}

export interface FxConversionResult {
  readonly native: { readonly amount: number; readonly currency: AccountCurrency };
  readonly display: {
    readonly amount: number;
    readonly currency: AccountCurrency;
    readonly fxRate: number;
    readonly fxAsOf: Date;
  };
  /**
   * `true` when the rate is past the freshness window (cache
   * entry older than 1h, etc.). The widget renders the amber
   * chip on `stale === true`. BR-FX-6 / REQ-FX-6.
   */
  readonly stale: boolean;
  readonly warnings?: string[];
}

export interface FxRateProvider {
  /**
   * Returns the converted amount. The native balance is
   * never mutated (BR-ACC-12). Throws `AppError(FX_UNAVAILABLE)`
   * when the provider cannot respond (the in-change
   * `FxRateProviderUnconfigured` stub always throws this).
   * Throws `AppError(FX_NOT_SUPPORTED)` when the provider
   * does not support the requested pair.
   */
  getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult>;
}
