import * as Sentry from '@sentry/nextjs';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import { logger } from '@/shared/logger/logger';
import type {
  FxConversionRequest,
  FxConversionResult,
  FxRateProvider,
} from '@/modules/accounts/domain/interfaces/fx-rate-provider.port';
import { fxCasaStringSchema, type FxCasaString } from '../../domain/entities/fx-casa-string.schema';
import type { DolarApiPort } from '../../domain/ports/dolar-api.port';
import type { FxRateCachePort } from '../../domain/ports/fx-rate-cache.port';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * The stale-fallback warning message. Emitted on the
 * `FxConversionResult.warnings` array when the cached entry
 * is past its TTL; the widget renders this alongside the
 * "Last updated: <ISO>" line (BR-ACC-18).
 */
const STALE_WARNING = 'FX rate is stale; showing last known value.';

/**
 * FX rate provider implementation backed by DolarAPI +
 * Upstash cache + per-process stampede lock.
 *
 * Implements the `FxRateProvider` port declared in
 * `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`.
 *
 * PR-1 notes:
 * - The current `FxConversionRequest` does NOT have a `casa`
 *   field. PR-3 adds it as a required field. This
 *   implementation already extracts `casa` from the request
 *   (via a type assertion at the boundary) and falls back to
 *   `env.FX_DEFAULT_CASA ?? 'oficial'` when the request does
 *   not carry one. The PR-3 diff is a single removal of the
 *   fallback.
 * - The cache + stampede + DolarAPI composition follows
 *   design §7.3 (read flow). The structured log events
 *   follow design §11.1.
 */
export interface FxRateProviderDolarApiDeps {
  readonly cache: FxRateCachePort;
  readonly lock: (casa: FxCasaString, fn: () => Promise<unknown>) => Promise<unknown>;
  readonly dolarApi: DolarApiPort;
  /**
   * Injected env for tests. Production code passes
   * `process.env` (or omits this field).
   */
  readonly env?: NodeJS.ProcessEnv;
}

export class FxRateProviderDolarApi implements FxRateProvider {
  private readonly cache: FxRateCachePort;
  private readonly lock: FxRateProviderDolarApiDeps['lock'];
  private readonly dolarApi: DolarApiPort;
  private readonly defaultCasa: FxCasaString;

  constructor(deps: FxRateProviderDolarApiDeps) {
    this.cache = deps.cache;
    this.lock = deps.lock;
    this.dolarApi = deps.dolarApi;
    // PR-1 stand-in: env default; PR-3 will replace this with
    // a strict `request.casa` read and remove the fallback.
    const env = deps.env ?? process.env;
    const raw = env.FX_DEFAULT_CASA;
    if (raw === undefined) {
      this.defaultCasa = 'oficial';
    } else {
      const parsed = fxCasaStringSchema.safeParse(raw);
      this.defaultCasa = parsed.success ? parsed.data : 'oficial';
    }
  }

  async getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult> {
    const casa = extractCasa(request, this.defaultCasa);
    const cached = await this.cache.get(casa);

    // --- Stale hit (cache hit past TTL) ---
    if (cached && isStale(cached.cachedAt)) {
      logger.info('fx.cache.hit', { casa, stale: true, fxAsOf: cached.quote.fxAsOf });
      // Fire-and-forget background refresh; caller does not
      // block on it (REQ-FX-1). Errors are captured in
      // `refreshIfStale`.
      void this.refreshIfStale(casa);
      return buildResult(request, cached.quote, [STALE_WARNING]);
    }

    // --- Fresh hit (cache hit within TTL) ---
    if (cached) {
      logger.info('fx.cache.hit', { casa, stale: false, fxAsOf: cached.quote.fxAsOf });
      return buildResult(request, cached.quote);
    }

    // --- Cache miss: stampede-locked upstream fetch ---
    const quote = await this.fetchWithLock(casa);
    return buildResult(request, quote);
  }

  /**
   * Background refresh for a stale cache entry. Re-fetches
   * from DolarAPI and overwrites the cache entry. Errors are
   * captured as Sentry warnings (not errors) per design §11.3
   * — the stale path is doing its job, the refresh is a
   * best-effort optimisation.
   */
  async refreshIfStale(casa: FxCasaString): Promise<void> {
    const startedAt = Date.now();
    try {
      const quote = await this.dolarApi.getDolares(casa);
      await this.cache.set(casa, quote);
      logger.info('fx.stale.refresh', {
        casa,
        dolarApiLatencyMs: Date.now() - startedAt,
        result: 'ok',
      });
    } catch (error) {
      logger.warn('fx.stale.refresh', {
        casa,
        dolarApiLatencyMs: Date.now() - startedAt,
        result: 'fail',
        errorCode: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
      });
      // Capture as Sentry warning — degraded, not broken.
      Sentry.captureException(error, {
        level: 'warning',
        extra: { casa, operation: 'stale_refresh' },
      });
    }
  }

  private async fetchWithLock(casa: FxCasaString) {
    const startedAt = Date.now();
    try {
      const quote = (await this.lock(casa, () =>
        this.dolarApi.getDolares(casa),
      )) as Awaited<ReturnType<DolarApiPort['getDolares']>>;
      await this.cache.set(casa, quote);
      logger.info('fx.cache.miss', {
        casa,
        dolarApiLatencyMs: Date.now() - startedAt,
        fxAsOf: quote.fxAsOf,
      });
      return quote;
    } catch (error) {
      logger.error('fx.cache.miss.fail', {
        casa,
        errorCode: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      // Capture as Sentry error — no upstream rate to serve
      // is a real failure (design §11.3).
      Sentry.captureException(error, {
        level: 'error',
        extra: { casa, operation: 'cache_miss_fetch' },
      });
      throw error;
    }
  }
}

/**
 * Extract the casa from the request, falling back to the
 * provider's `defaultCasa`. The current port type does not
 * declare `casa`; PR-3 makes it required. The cast here is
 * the single boundary where the PR-3 port change lands.
 */
function extractCasa(
  request: FxConversionRequest,
  fallback: FxCasaString,
): FxCasaString {
  const candidate = (request as unknown as { casa?: unknown }).casa;
  if (typeof candidate === 'string') {
    const parsed = fxCasaStringSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return fallback;
}

function isStale(cachedAt: string): boolean {
  return Date.now() - new Date(cachedAt).getTime() > ONE_HOUR_MS;
}

function buildResult(
  request: FxConversionRequest,
  quote: { buy: number; sell: number; fxAsOf: string },
  warnings?: string[],
): FxConversionResult {
  const fxRate = quote.sell;
  const displayAmount = (request.native.amount / 100) * fxRate;
  return {
    native: {
      amount: request.native.amount,
      currency: request.native.currency,
    },
    display: {
      amount: displayAmount,
      currency: request.displayCurrency,
      fxRate,
      fxAsOf: new Date(quote.fxAsOf),
    },
    warnings,
  };
}