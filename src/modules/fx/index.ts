/**
 * Public surface of the `fx` module. Other modules (and the
 * DI composition root at `src/modules/api/app.ts`) import
 * ONLY from this file. Nothing else in the codebase reaches
 * into the module's internals.
 *
 * Exports:
 * - `FxRateProviderDolarApi` — the implementation of the
 *   `FxRateProvider` port declared in `@/modules/accounts`.
 *   Constructed with `{ cache, lock, dolarApi, env }`.
 * - `DolarApiClient` — the HTTP client (implements
 *   `DolarApiPort`).
 * - `UpstashFxRateCache` — the Upstash Redis adapter
 *   (env-var-gated no-op fallback).
 * - `withLock` — the per-process stampede lock wrapper.
 * - `fxCasaStringSchema` + `FX_CASAS` + `FxCasaString` — the
 *   lowercase DolarAPI casa enum (the single source of truth
 *   for the lowercase form).
 * - `FxQuote` — the value-object type for a single FX quote.
 *
 * The barrel does NOT export the `FxRateCachePort` /
 * `DolarApiPort` interfaces — those are implementation
 * details consumed only by `FxRateProviderDolarApi`. Nor does
 * it export the ports from `@/modules/accounts` (consumers
 * import `FxRateProvider` from `@/modules/accounts`).
 */

export { FxRateProviderDolarApi } from './infrastructure/external/fx-rate-provider.dolar-api';
export { DolarApiClient } from './infrastructure/external/dolar-api.client';
export { UpstashFxRateCache } from './infrastructure/cache/upstash-fx-rate.cache';
export { withLock } from './infrastructure/stampede/stampede-lock';

export {
  fxCasaStringSchema,
  FX_CASAS,
  type FxCasaString,
} from './domain/entities/fx-casa-string.schema';

export { type FxQuote } from './domain/entities/fx-quote';