import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FxRateProviderDolarApi } from './fx-rate-provider.dolar-api';
import type { DolarApiPort } from '../../domain/ports/dolar-api.port';
import type { FxRateCachePort, FxRateCacheEntry } from '../../domain/ports/fx-rate-cache.port';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { FxQuote } from '../../domain/entities/fx-quote';
import type { FxCasaString } from '../../domain/entities/fx-casa-string.schema';
import { withLock } from '../stampede/stampede-lock';

const makeQuote = (overrides: Partial<FxQuote> = {}): FxQuote => ({
  casa: 'oficial',
  buy: 1180,
  sell: 1220,
  fxAsOf: '2026-06-21T18:00:00.000Z',
  ...overrides,
});

const makeEntry = (overrides: Partial<FxRateCacheEntry> = {}): FxRateCacheEntry => ({
  quote: makeQuote(),
  cachedAt: new Date().toISOString(),
  ...overrides,
});

interface MockCache extends FxRateCachePort {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

interface MockClient extends DolarApiPort {
  getDolares: ReturnType<typeof vi.fn>;
}

const makeCache = (): MockCache => ({
  get: vi.fn(),
  set: vi.fn(),
});

const makeClient = (): MockClient => ({
  getDolares: vi.fn(),
});

const requestFor = (nativeAmount: number, casa: FxCasaString) =>
  ({
    native: { amount: nativeAmount, currency: 'USD' as const },
    displayCurrency: 'ARS' as const,
    asOf: new Date('2026-06-21T18:00:00.000Z'),
    casa,
  }) as unknown as Parameters<FxRateProviderDolarApi['getDisplayAmount']>[0];

const emptyEnv = {} as NodeJS.ProcessEnv;

describe('FxRateProviderDolarApi', () => {
  beforeEach(() => {
    vi.stubEnv('FX_DEFAULT_CASA', undefined as unknown as string);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('cache miss + DolarAPI 200 -> returns the quote with stale=false, calls cache.set exactly once', async () => {
    const cache = makeCache();
    const client = makeClient();
    cache.get.mockResolvedValue(null);
    client.getDolares.mockResolvedValue(makeQuote());
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    const result = await provider.getDisplayAmount(requestFor(10000, 'oficial'));
    expect(result.display.fxRate).toBe(1220);
    expect(result.display.currency).toBe('ARS');
    expect(result.warnings).toBeUndefined();
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(client.getDolares).toHaveBeenCalledTimes(1);
  });

  it('cache fresh hit -> returns the cached quote with stale=false, no DolarAPI call', async () => {
    const cache = makeCache();
    const client = makeClient();
    const entry = makeEntry({ cachedAt: new Date().toISOString() });
    cache.get.mockResolvedValue(entry);
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    const result = await provider.getDisplayAmount(requestFor(10000, 'oficial'));
    expect(result.display.fxRate).toBe(1220);
    expect(client.getDolares).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('cache stale hit (cachedAt < now-1h) -> returns stale=true AND schedules a background refresh', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-06-21T20:00:00.000Z');
    vi.setSystemTime(now);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000 - 1).toISOString();
    const cache = makeCache();
    const client = makeClient();
    cache.get.mockResolvedValue(makeEntry({ cachedAt: oneHourAgo }));
    client.getDolares.mockResolvedValue(makeQuote());
    const refreshSpy = vi
      .spyOn(FxRateProviderDolarApi.prototype, 'refreshIfStale')
      .mockResolvedValue(undefined);
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    const result = await provider.getDisplayAmount(requestFor(10000, 'oficial'));
    expect(result.warnings).toContain('FX rate is stale; showing last known value.');
    // Drain the microtask queue so the fire-and-forget
    // refreshIfStale runs to completion; then assert it was
    // invoked with the right casa.
    await vi.runAllTimersAsync();
    expect(refreshSpy).toHaveBeenCalledWith('oficial');
    refreshSpy.mockRestore();
    vi.useRealTimers();
  });

  it('cache stale hit + background refresh fails -> caller still receives stale value with stale=true, no AppError', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-06-21T20:00:00.000Z');
    vi.setSystemTime(now);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000 - 1).toISOString();
    const cache = makeCache();
    const client = makeClient();
    cache.get.mockResolvedValue(makeEntry({ cachedAt: oneHourAgo }));
    client.getDolares.mockRejectedValue(
      new AppError({ code: ErrorCode.FX_UNAVAILABLE, message: 'upstream down' }),
    );
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    const result = await provider.getDisplayAmount(requestFor(10000, 'oficial'));
    expect(result.warnings).toContain('FX rate is stale; showing last known value.');
    // The fire-and-forget refresh will reject internally; let
    // the microtask queue drain so the rejection is observed
    // and swallowed (not propagated to the caller).
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('cache miss + DolarAPI 500 -> throws AppError(FX_UNAVAILABLE), no cache write', async () => {
    const cache = makeCache();
    const client = makeClient();
    cache.get.mockResolvedValue(null);
    client.getDolares.mockRejectedValue(
      new AppError({ code: ErrorCode.FX_UNAVAILABLE, message: 'upstream down' }),
    );
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    await expect(provider.getDisplayAmount(requestFor(10000, 'oficial'))).rejects.toMatchObject({
      code: ErrorCode.FX_UNAVAILABLE,
    });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('provider receives a casa on the request and passes it to the cache + the DolarAPI client', async () => {
    const cache = makeCache();
    const client = makeClient();
    cache.get.mockResolvedValue(null);
    client.getDolares.mockResolvedValue(makeQuote({ casa: 'blue', buy: 1100, sell: 1140 }));
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    await provider.getDisplayAmount(requestFor(10000, 'blue'));
    expect(cache.get).toHaveBeenCalledWith('blue');
    expect(client.getDolares).toHaveBeenCalledWith('blue');
    expect(cache.set).toHaveBeenCalledWith('blue', expect.objectContaining({ casa: 'blue' }));
  });

  it('provider does NOT read process.env.FX_DEFAULT_CASA at request time (env var absence does not change the resolved casa)', async () => {
    const cache = makeCache();
    const client = makeClient();
    cache.get.mockResolvedValue(null);
    client.getDolares.mockResolvedValue(makeQuote({ casa: 'mep' }));
    vi.stubEnv('FX_DEFAULT_CASA', 'oficial');
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    await provider.getDisplayAmount(requestFor(10000, 'mep'));
    // Env says 'oficial' but the request carries 'mep' — the
    // provider MUST honour the request's casa and not silently
    // overwrite it with the env default.
    expect(client.getDolares).toHaveBeenCalledWith('mep');
    expect(cache.set).toHaveBeenCalledWith('mep', expect.objectContaining({ casa: 'mep' }));
  });

  it('two requests for the same casa in quick succession hit the cache (no stampede)', async () => {
    const cache = makeCache();
    const client = makeClient();
    const entry = makeEntry();
    cache.get.mockResolvedValueOnce(entry).mockResolvedValueOnce(entry);
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: emptyEnv,
    });
    await provider.getDisplayAmount(requestFor(10000, 'oficial'));
    await provider.getDisplayAmount(requestFor(10000, 'oficial'));
    // First call reads cache.get -> returns entry (no client).
    // Second call reads cache.get -> returns entry (no client).
    // Both hits; the DolarAPI is never called.
    expect(client.getDolares).not.toHaveBeenCalled();
  });
});