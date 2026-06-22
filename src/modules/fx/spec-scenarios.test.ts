/**
 * Spec scenario coverage for REQ-FX-1 to REQ-FX-8.
 *
 * REQ-FX-9 (the casa column migration) lands in PR-2; this
 * file deliberately excludes it.
 *
 * Each test corresponds to a Scenario block in
 * `openspec/changes/fx-cache/specs/fx/spec.md`. The tests
 * compose the production modules built in T1.1–T1.12; this
 * file is a coverage contract, not a re-implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Redis } from '@upstash/redis';
import { FxRateProviderDolarApi } from './infrastructure/external/fx-rate-provider.dolar-api';
import { DolarApiClient } from './infrastructure/external/dolar-api.client';
import { UpstashFxRateCache } from './infrastructure/cache/upstash-fx-rate.cache';
import { withLock, _resetInflightForTests } from './infrastructure/stampede/stampede-lock';
import type { FxRateCacheEntry } from './domain/ports/fx-rate-cache.port';
import { FX_CASAS, type FxCasaString } from './domain/entities/fx-casa-string.schema';
import type { FxQuote } from './domain/entities/fx-quote';
import type { FxRateProviderDolarApiDeps } from './infrastructure/external/fx-rate-provider.dolar-api';
import { AppError } from '@/shared/errors/app-error';

interface _MockCache extends InstanceType<typeof UpstashFxRateCache> {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

interface MockClient {
  getDolares: ReturnType<typeof vi.fn>;
}

const makeFakeRedis = () => {
  const store = new Map<string, FxRateCacheEntry>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: FxRateCacheEntry) => {
      store.set(key, value);
      return 'OK' as const;
    }),
  };
};

const buildProvider = (
  fakeRedis: ReturnType<typeof makeFakeRedis>,
  client: MockClient,
  env?: Record<string, string>,
): FxRateProviderDolarApi => {
  const cache = new UpstashFxRateCache({
    env: {
      UPSTASH_REDIS_REST_URL: 'https://upstash.example',
      UPSTASH_REDIS_REST_TOKEN: 'tok',
      ...env,
    } as unknown as NodeJS.ProcessEnv,
    redis: fakeRedis as unknown as Redis,
  });
  const dolarApi: MockClient = client;
  return new FxRateProviderDolarApi({
    cache,
    lock: withLock,
    dolarApi: dolarApi as unknown as FxRateProviderDolarApiDeps['dolarApi'],
  });
};

const makeQuote = (overrides: Partial<FxQuote> = {}): FxQuote => ({
  casa: 'oficial',
  buy: 1180,
  sell: 1220,
  fxAsOf: '2026-06-21T18:00:00.000Z',
  ...overrides,
});

const requestFor = (casa: FxCasaString) =>
  ({
    native: { amount: 10000, currency: 'USD' as never },
    displayCurrency: 'ARS' as never,
    asOf: new Date(),
    casa,
  }) as unknown as Parameters<FxRateProviderDolarApi['getDisplayAmount']>[0];

describe('REQ-FX-1 — Cache TTL is 1 hour and stale-fallback returns the last known value', () => {
  beforeEach(() => {
    _resetInflightForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Scenario: cache miss -> fetch -> write -> hit fresh -> hit stale with background refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T18:00:00.000Z'));
    const fakeRedis = makeFakeRedis();
    const client: MockClient = { getDolares: vi.fn().mockResolvedValue(makeQuote()) };
    const provider = buildProvider(fakeRedis, client);
    const req = requestFor('oficial');

    // 1. Cache miss -> fetch + write.
    const r1 = await provider.getDisplayAmount(req);
    expect(r1.warnings).toBeUndefined();
    expect(fakeRedis.set).toHaveBeenCalledTimes(1);

    // 2. Fresh hit (now == cachedAt + small delta).
    const r2 = await provider.getDisplayAmount(req);
    expect(r2.warnings).toBeUndefined();

    // 3. Advance past 1h; next call is stale with a background refresh.
    vi.setSystemTime(new Date('2026-06-21T19:00:01.000Z'));
    const r3 = await provider.getDisplayAmount(req);
    expect(r3.warnings).toContain('FX rate is stale; showing last known value.');
    await vi.runAllTimersAsync();
    expect(client.getDolares).toHaveBeenCalledTimes(2);
  });

  it('Scenario: stale hit + background refresh failure does NOT surface to the caller', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T18:00:00.000Z'));
    const fakeRedis = makeFakeRedis();
    const client: MockClient = {
      getDolares: vi
        .fn()
        .mockResolvedValueOnce(makeQuote())
        .mockRejectedValueOnce(new Error('refresh failed')),
    };
    const provider = buildProvider(fakeRedis, client);
    const req = requestFor('oficial');
    await provider.getDisplayAmount(req);
    vi.setSystemTime(new Date('2026-06-21T19:00:01.000Z'));
    const staleResult = await provider.getDisplayAmount(req);
    expect(staleResult.warnings).toContain('FX rate is stale; showing last known value.');
    await vi.runAllTimersAsync();
  });
});

describe('REQ-FX-2 — DolarAPI unavailable on cache miss throws FX_UNAVAILABLE', () => {
  beforeEach(() => {
    _resetInflightForTests();
  });

  it('Scenario: DolarAPI 5xx on cache miss -> throws AppError(FX_UNAVAILABLE)', async () => {
    const fakeRedis = makeFakeRedis();
    const client: MockClient = {
      getDolares: vi
        .fn()
        .mockRejectedValue(new AppError({ code: 'FX_UNAVAILABLE', message: 'upstream 500' })),
    };
    const provider = buildProvider(fakeRedis, client);
    await expect(provider.getDisplayAmount(requestFor('oficial'))).rejects.toMatchObject({
      code: 'FX_UNAVAILABLE',
    });
  });

  it('Scenario: DolarAPI malformed payload on cache miss -> throws AppError(FX_UNAVAILABLE)', async () => {
    const client = new DolarApiClient({
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ moneda: 'USD', casa: 'oficial', nombre: 'X', compra: 1, venta: 1 }),
      }) as unknown as typeof fetch,
    });
    const fakeRedis = makeFakeRedis();
    const provider = new FxRateProviderDolarApi({
      cache: new UpstashFxRateCache({
        env: {
          UPSTASH_REDIS_REST_URL: 'https://upstash.example',
          UPSTASH_REDIS_REST_TOKEN: 'tok',
        } as unknown as NodeJS.ProcessEnv,
        redis: fakeRedis as unknown as Redis,
      }),
      lock: withLock,
      dolarApi: client,
    });
    await expect(provider.getDisplayAmount(requestFor('oficial'))).rejects.toMatchObject({
      code: 'FX_UNAVAILABLE',
    });
  });
});

describe("REQ-FX-3 — Casa resolution is the caller's responsibility", () => {
  beforeEach(() => {
    _resetInflightForTests();
  });

  it('Scenario: provider receives casa on the request and uses it for the cache + upstream', async () => {
    const fakeRedis = makeFakeRedis();
    const client: MockClient = {
      getDolares: vi.fn().mockResolvedValue(makeQuote({ casa: 'blue' })),
    };
    const provider = buildProvider(fakeRedis, client);
    await provider.getDisplayAmount(requestFor('blue'));
    expect(fakeRedis.set.mock.calls[0]?.[0]).toBe('gastos-personales:fx:v1:blue');
    expect(client.getDolares.mock.calls[0]?.[0]).toBe('blue');
  });

  it('Scenario: provider does NOT read process.env.FX_DEFAULT_CASA at request time', async () => {
    vi.stubEnv('FX_DEFAULT_CASA', 'oficial');
    const fakeRedis = makeFakeRedis();
    const client: MockClient = {
      getDolares: vi.fn().mockResolvedValue(makeQuote({ casa: 'mep' })),
    };
    const provider = buildProvider(fakeRedis, client);
    await provider.getDisplayAmount(requestFor('mep'));
    expect(client.getDolares).toHaveBeenCalledWith('mep');
    expect(fakeRedis.set.mock.calls[0]?.[0]).toBe('gastos-personales:fx:v1:mep');
    vi.unstubAllEnvs();
  });
});

describe('REQ-FX-4 — Cache key is namespaced by the rate-limit module convention', () => {
  beforeEach(() => {
    _resetInflightForTests();
  });

  it('Scenario: first-write key is exactly gastos-personales:fx:v1:<casa>', async () => {
    const fakeRedis = makeFakeRedis();
    const client: MockClient = { getDolares: vi.fn().mockResolvedValue(makeQuote()) };
    const provider = buildProvider(fakeRedis, client);
    await provider.getDisplayAmount(requestFor('oficial'));
    expect(fakeRedis.set.mock.calls[0]?.[0]).toBe('gastos-personales:fx:v1:oficial');
  });

  it('Scenario: different casas map to distinct keys', async () => {
    const fakeRedis = makeFakeRedis();
    const client: MockClient = { getDolares: vi.fn().mockResolvedValue(makeQuote()) };
    const provider = buildProvider(fakeRedis, client);
    await provider.getDisplayAmount(requestFor('oficial'));
    await provider.getDisplayAmount(requestFor('blue'));
    const keys = fakeRedis.set.mock.calls.map((c) => c[0]);
    expect(keys).toContain('gastos-personales:fx:v1:oficial');
    expect(keys).toContain('gastos-personales:fx:v1:blue');
  });
});

describe('REQ-FX-5 — Cache is a no-op when Upstash env vars are missing', () => {
  it('Scenario: missing UPSTASH env vars -> adapter is no-op; provider falls through to DolarAPI on every call', async () => {
    _resetInflightForTests();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined as unknown as string);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined as unknown as string);
    const cache = new UpstashFxRateCache();
    const client: MockClient = { getDolares: vi.fn().mockResolvedValue(makeQuote()) };
    const provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client as unknown as FxRateProviderDolarApiDeps['dolarApi'],
    });
    await provider.getDisplayAmount(requestFor('oficial'));
    await provider.getDisplayAmount(requestFor('oficial'));
    expect(client.getDolares).toHaveBeenCalledTimes(2);
  });

  it('Scenario: missing env vars do NOT crash at boot', () => {
    expect(() => new UpstashFxRateCache()).not.toThrow();
  });
});

describe('REQ-FX-7 — The stampede lock coalesces concurrent cold-start fetches', () => {
  beforeEach(() => {
    _resetInflightForTests();
  });

  it('Scenario: concurrent same-casa cache-miss calls fire one DolarAPI fetch', async () => {
    const fakeRedis = makeFakeRedis();
    const client: MockClient = { getDolares: vi.fn().mockResolvedValue(makeQuote()) };
    const provider = buildProvider(fakeRedis, client);
    const req = requestFor('oficial');
    await Promise.all([
      provider.getDisplayAmount(req),
      provider.getDisplayAmount(req),
      provider.getDisplayAmount(req),
    ]);
    expect(client.getDolares).toHaveBeenCalledTimes(1);
  });

  it('Scenario: concurrent different-casa cache-miss calls are independent', async () => {
    const fakeRedis = makeFakeRedis();
    const client: MockClient = {
      getDolares: vi
        .fn()
        .mockImplementation(async (c: string) => makeQuote({ casa: c as FxCasaString })),
    };
    const provider = buildProvider(fakeRedis, client);
    await Promise.all([
      provider.getDisplayAmount(requestFor('oficial')),
      provider.getDisplayAmount(requestFor('blue')),
    ]);
    expect(client.getDolares).toHaveBeenCalledTimes(2);
  });
});

describe('REQ-FX-8 — DolarAPI base URL is hardcoded with an env-var override', () => {
  it('Scenario: default URL is https://dolarapi.com/v1/dolares/<casa>', async () => {
    vi.stubEnv('DOLAR_API_BASE_URL', undefined as unknown as string);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        moneda: 'USD',
        casa: 'oficial',
        nombre: 'Oficial',
        compra: 1180,
        venta: 1220,
        fechaActualizacion: '2026-06-21T18:00:00.000Z',
      }),
    });
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    await client.getDolares('oficial');
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://dolarapi.com/v1/dolares/oficial');
    vi.unstubAllEnvs();
  });

  it('Scenario: env-var override routes the request to the override URL', async () => {
    vi.stubEnv('DOLAR_API_BASE_URL', 'https://dolarapi.example/v2');
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        moneda: 'USD',
        casa: 'oficial',
        nombre: 'Oficial',
        compra: 1180,
        venta: 1220,
        fechaActualizacion: '2026-06-21T18:00:00.000Z',
      }),
    });
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    await client.getDolares('oficial');
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://dolarapi.example/v2/dolares/oficial');
    vi.unstubAllEnvs();
  });
});

describe('Cross-cutting: cache key for every casa', () => {
  it.each(FX_CASAS)('cache key for casa "%s" is gastos-personales:fx:v1:%s', async (casa) => {
    _resetInflightForTests();
    const fakeRedis = makeFakeRedis();
    const client: MockClient = { getDolares: vi.fn().mockResolvedValue(makeQuote({ casa })) };
    const provider = buildProvider(fakeRedis, client);
    await provider.getDisplayAmount(requestFor(casa));
    expect(fakeRedis.set.mock.calls[0]?.[0]).toBe(`gastos-personales:fx:v1:${casa}`);
  });
});
