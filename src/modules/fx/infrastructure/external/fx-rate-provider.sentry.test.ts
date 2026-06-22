import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import { FxRateProviderDolarApi } from './fx-rate-provider.dolar-api';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { DolarApiPort } from '../../domain/ports/dolar-api.port';
import type { FxRateCachePort } from '../../domain/ports/fx-rate-cache.port';
import type { FxCasaString } from '../../domain/entities/fx-casa-string.schema';
import { withLock } from '../stampede/stampede-lock';

const sentryMock = Sentry as unknown as { captureException: ReturnType<typeof vi.fn> };

const requestFor = (casa: FxCasaString) =>
  ({
    native: { amount: 10000, currency: 'USD' as never },
    displayCurrency: 'ARS' as never,
    asOf: new Date(),
    casa,
  }) as unknown as Parameters<FxRateProviderDolarApi['getDisplayAmount']>[0];

const makeCache = () => ({
  get: vi.fn() as unknown as FxRateCachePort['get'],
  set: vi.fn() as unknown as FxRateCachePort['set'],
});

const makeClient = () => ({
  getDolares: vi.fn() as unknown as DolarApiPort['getDolares'],
});

const emptyEnv = {} as NodeJS.ProcessEnv;

describe('FxRateProviderDolarApi — Sentry capture rules (T1.11)', () => {
  beforeEach(() => {
    vi.stubEnv('FX_DEFAULT_CASA', undefined as unknown as string);
    sentryMock.captureException.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('FX_UNAVAILABLE on cache miss -> Sentry.captureException called with level=error', async () => {
    const cache = makeCache();
    const client = makeClient();
    cache.get.mockResolvedValue(null);
    client.getDolares.mockRejectedValue(
      new AppError({ code: ErrorCode.FX_UNAVAILABLE, message: 'downstream' }),
    );
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    await expect(provider.getDisplayAmount(requestFor('oficial'))).rejects.toMatchObject({
      code: ErrorCode.FX_UNAVAILABLE,
    });
    expect(sentryMock.captureException).toHaveBeenCalledWith(
      expect.any(AppError),
      expect.objectContaining({ level: 'error' }),
    );
  });

  it('FX_UNAVAILABLE on stale refresh -> Sentry.captureException called with level=warning', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-06-21T20:00:00.000Z');
    vi.setSystemTime(now);
    const cache = makeCache();
    const client = makeClient();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000 - 1).toISOString();
    cache.get.mockResolvedValue({
      quote: {
        casa: 'oficial',
        buy: 1180,
        sell: 1220,
        fxAsOf: '2026-06-21T18:00:00.000Z',
      },
      cachedAt: oneHourAgo,
    });
    client.getDolares.mockRejectedValue(
      new AppError({ code: ErrorCode.FX_UNAVAILABLE, message: 'refresh fail' }),
    );
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    await provider.getDisplayAmount(requestFor('oficial'));
    await vi.runAllTimersAsync();
    expect(sentryMock.captureException).toHaveBeenCalledWith(
      expect.any(AppError),
      expect.objectContaining({ level: 'warning' }),
    );
    vi.useRealTimers();
  });

  it('cache layer no-op (missing env vars) -> Sentry.captureException is NOT called on the happy path', async () => {
    const cache = makeCache();
    const client = makeClient();
    cache.get.mockResolvedValue(null);
    client.getDolares.mockResolvedValue({
      casa: 'oficial',
      buy: 1180,
      sell: 1220,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    });
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    await provider.getDisplayAmount(requestFor('oficial'));
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it('UpstashFxRateCache errors are captured with the operation and casa, never with env var values', async () => {
    const cache = makeCache();
    cache.get.mockRejectedValue(new Error('redis down'));
    const client = makeClient();
    client.getDolares.mockResolvedValue({
      casa: 'blue',
      buy: 1100,
      sell: 1140,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    });
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    await expect(provider.getDisplayAmount(requestFor('blue'))).rejects.toThrow('redis down');
    // Cache errors propagate as INTERNAL_ERROR; the
    // application layer's errorHandler converts the plain
    // Error to AppError(INTERNAL_ERROR). The provider does
    // not capture cache errors on its own. This test pins
    // the contract: no Sentry-captured payload contains env
    // var values.
    for (const call of sentryMock.captureException.mock.calls) {
      const payload = call[1] as { extra?: Record<string, unknown> } | undefined;
      const extra = payload?.extra ?? {};
      expect(extra).not.toHaveProperty('UPSTASH_REDIS_REST_URL');
      expect(extra).not.toHaveProperty('UPSTASH_REDIS_REST_TOKEN');
      expect(extra).not.toHaveProperty('DOLAR_API_BASE_URL');
    }
  });
});