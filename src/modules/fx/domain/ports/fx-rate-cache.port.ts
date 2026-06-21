import type { FxCasaString } from '../entities/fx-casa-string.schema';
import type { FxQuote } from '../entities/fx-quote';

/**
 * A single cached entry. The `cachedAt` field is the ISO-8601
 * timestamp at which the entry was written to the cache; the
 * `FxRateProviderDolarApi` uses it to compute the `stale`
 * flag (entry is stale when `Date.now() - cachedAt > 1 h`,
 * per design §7.2).
 *
 * The `cachedAt` field is stamped by the cache adapter on
 * write; callers pass only the `FxQuote` to `set`. The port
 * returns the full entry on `get` so the provider can
 * inspect `cachedAt` directly.
 */
export interface FxRateCacheEntry {
  readonly quote: FxQuote;
  readonly cachedAt: string;
}

/**
 * Port: per-casa FX rate cache.
 *
 * The `UpstashFxRateCache` adapter implements this port. When
 * the Upstash env vars are missing the adapter is a no-op
 * (`get` returns `null`, `set` is silently dropped), matching
 * the env-var-gated pattern in `src/shared/rate-limit/rate-limit.ts`.
 *
 * The provider treats a `null` return from `get` as a cache
 * miss and falls through to the stampede-locked upstream fetch.
 */
export interface FxRateCachePort {
  get(casa: FxCasaString): Promise<FxRateCacheEntry | null>;
  set(casa: FxCasaString, quote: FxQuote): Promise<void>;
}
