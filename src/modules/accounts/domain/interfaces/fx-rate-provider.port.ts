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
 * Errors (caught by the application layer and mapped to
 * HTTP statuses):
 * - `AppError(FX_UNAVAILABLE, 503)` — the provider cannot
 *   respond (no impl registered, network failure, etc.).
 * - `AppError(FX_NOT_SUPPORTED, 409)` — the configured
 *   provider does not support the requested pair.
 */

import type { AccountCurrency } from '../entities/financial-account';

export interface FxConversionRequest {
  readonly native: {
    readonly amount: number; // minor units (cents)
    readonly currency: AccountCurrency;
  };
  readonly displayCurrency: AccountCurrency;
  readonly asOf: Date;
}

export interface FxConversionResult {
  readonly native: { readonly amount: number; readonly currency: AccountCurrency };
  readonly display: {
    readonly amount: number;
    readonly currency: AccountCurrency;
    readonly fxRate: number;
    readonly fxAsOf: Date;
  };
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
