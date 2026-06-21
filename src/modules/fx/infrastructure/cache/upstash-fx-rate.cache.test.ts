import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Redis } from '@upstash/redis';
import { UpstashFxRateCache, type UpstashFxRateCacheDeps } from './upstash-fx-rate.cache';
import type { FxQuote } from '../../domain/entities/fx-quote';
import type { FxRateCacheEntry } from '../../domain/ports/fx-rate-cache.port';

const makeQuote = (overrides: Partial<FxQuote> = {}): FxQuote => ({
  casa: 'oficial',
  buy: 1180,
  sell: 1220,
  fxAsOf: '2026-06-21T18:00:00.000Z',
  ...overrides,
});

interface FakeRedis {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

const makeFakeRedis = (): FakeRedis => ({
  get: vi.fn(),
  set: vi.fn(),
});

const withFakeRedis = (fake: FakeRedis): UpstashFxRateCacheDeps => ({
  redis: fake as unknown as Redis,
});

describe('UpstashFxRateCache', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined as unknown as string);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined as unknown as string);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the cached entry from the Upstash GET command when both env vars are set', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-abc');
    const fake = makeFakeRedis();
    const stored: FxRateCacheEntry = {
      quote: makeQuote(),
      cachedAt: '2026-06-21T18:00:01.000Z',
    };
    fake.get.mockResolvedValue(stored);
    const cache = new UpstashFxRateCache(withFakeRedis(fake));
    const result = await cache.get('oficial');
    expect(result).toEqual(stored);
    expect(fake.get).toHaveBeenCalledWith('gastos-personales:fx:v1:oficial');
  });

  it('writes the JSON-serialised entry with EX 3600 on set when both env vars are set', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-abc');
    const fake = makeFakeRedis();
    fake.set.mockResolvedValue('OK');
    const cache = new UpstashFxRateCache(withFakeRedis(fake));
    const quote = makeQuote({ casa: 'blue', buy: 1100, sell: 1140 });
    await cache.set('blue', quote);
    expect(fake.set).toHaveBeenCalledWith(
      'gastos-personales:fx:v1:blue',
      { quote, cachedAt: expect.any(String) as string },
      { ex: 3600 },
    );
  });

  it('returns null from get without touching Redis when UPSTASH_REDIS_REST_URL is unset', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-abc');
    const fake = makeFakeRedis();
    const cache = new UpstashFxRateCache(withFakeRedis(fake));
    const result = await cache.get('oficial');
    expect(result).toBeNull();
    expect(fake.get).not.toHaveBeenCalled();
  });

  it('set is a no-op when UPSTASH_REDIS_REST_TOKEN is unset', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    const fake = makeFakeRedis();
    const cache = new UpstashFxRateCache(withFakeRedis(fake));
    await cache.set('oficial', makeQuote());
    expect(fake.set).not.toHaveBeenCalled();
  });

  it('uses the gastos-personales:fx:v1: cache key prefix on every read and write', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-abc');
    const fake = makeFakeRedis();
    fake.get.mockResolvedValue(null);
    fake.set.mockResolvedValue('OK');
    const cache = new UpstashFxRateCache(withFakeRedis(fake));
    await cache.get('cripto');
    await cache.set('tarjeta', makeQuote({ casa: 'tarjeta' }));
    expect(fake.get.mock.calls[0]?.[0]).toBe('gastos-personales:fx:v1:cripto');
    expect(fake.set.mock.calls[0]?.[0]).toBe('gastos-personales:fx:v1:tarjeta');
  });

  it('stamps cachedAt on every set call (the adapter owns the timestamp)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-abc');
    const fake = makeFakeRedis();
    fake.set.mockResolvedValue('OK');
    const before = Date.now();
    const cache = new UpstashFxRateCache(withFakeRedis(fake));
    await cache.set('oficial', makeQuote());
    const after = Date.now();
    const written = fake.set.mock.calls[0]?.[1] as FxRateCacheEntry;
    const writtenMs = new Date(written.cachedAt).getTime();
    expect(writtenMs).toBeGreaterThanOrEqual(before);
    expect(writtenMs).toBeLessThanOrEqual(after);
  });
});
