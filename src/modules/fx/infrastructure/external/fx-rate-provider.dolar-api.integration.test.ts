import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Redis } from '@upstash/redis';
import { FxRateProviderDolarApi } from './fx-rate-provider.dolar-api';
import { DolarApiClient } from './dolar-api.client';
import { UpstashFxRateCache } from '../cache/upstash-fx-rate.cache';
import { withLock } from '../stampede/stampede-lock';
import type { FxRateCacheEntry } from '../../domain/ports/fx-rate-cache.port';

/**
 * Integration test: spins up a small in-process HTTP server
 * that mimics the DolarAPI wire shape, points the DolarAPI
 * client at it via DOLAR_API_BASE_URL, and exercises the full
 * read flow end-to-end through a fake Upstash Redis backed
 * by an in-memory Map.
 *
 * The fake Redis satisfies the @upstash/redis Redis class
 * shape (get / set methods); the integration test points the
 * UpstashFxRateCache at the fake via the `redis` deps option
 * added in T1.5. Both env vars are stubbed so the cache
 * activates (the no-op gate would otherwise short-circuit).
 */
describe('FxRateProviderDolarApi integration (stub DolarAPI server)', () => {
  let server: Server;
  let baseUrl: string;
  let hitCount: number;
  let fakeStore: Map<string, FxRateCacheEntry>;
  let cache: UpstashFxRateCache;
  let client: DolarApiClient;
  let provider: FxRateProviderDolarApi;

  const startStubServer = async (): Promise<void> => {
    hitCount = 0;
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      hitCount += 1;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          moneda: 'USD',
          casa: 'oficial',
          nombre: 'Oficial',
          compra: 1180,
          venta: 1220,
          fechaActualizacion: '2026-06-21T18:00:00.000Z',
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  };

  const buildProvider = (): void => {
    fakeStore = new Map<string, FxRateCacheEntry>();
    const fakeRedis = {
      get: vi.fn(async (key: string) => fakeStore.get(key) ?? null),
      set: vi.fn(async (key: string, value: FxRateCacheEntry) => {
        fakeStore.set(key, value);
        return 'OK' as const;
      }),
    };
    cache = new UpstashFxRateCache({
      env: {
        UPSTASH_REDIS_REST_URL: 'https://upstash.example',
        UPSTASH_REDIS_REST_TOKEN: 'token-abc',
      } as unknown as NodeJS.ProcessEnv,
      redis: fakeRedis as unknown as Redis,
    });
    client = new DolarApiClient({ env: { DOLAR_API_BASE_URL: baseUrl } as unknown as NodeJS.ProcessEnv });
    provider = new FxRateProviderDolarApi({
      cache,
      lock: withLock,
      dolarApi: client,
      env: {} as NodeJS.ProcessEnv,
    });
  };

  beforeEach(async () => {
    await startStubServer();
    buildProvider();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const requestOficial = () =>
    ({
      native: { amount: 10000, currency: 'USD' as never },
      displayCurrency: 'ARS' as never,
      asOf: new Date(),
      casa: 'oficial',
    }) as unknown as Parameters<FxRateProviderDolarApi['getDisplayAmount']>[0];

  it('first call -> cache miss -> stub server hit -> FxQuote returned + cache.set called', async () => {
    const result = await provider.getDisplayAmount(requestOficial());
    expect(hitCount).toBe(1);
    expect(result.display.fxRate).toBe(1220);
    expect(fakeStore.size).toBe(1);
  });

  it('second call within TTL -> cache hit -> stub server NOT hit', async () => {
    const req = requestOficial();
    await provider.getDisplayAmount(req);
    await provider.getDisplayAmount(req);
    expect(hitCount).toBe(1);
  });

  it('cache key in the fake Redis is exactly gastos-personales:fx:v1:oficial', async () => {
    await provider.getDisplayAmount(requestOficial());
    expect(fakeStore.has('gastos-personales:fx:v1:oficial')).toBe(true);
  });

  it('entry past 1h triggers stale=true and a background refresh', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-06-21T20:00:00.000Z');
    vi.setSystemTime(now);
    const req = requestOficial();
    await provider.getDisplayAmount(req);
    expect(hitCount).toBe(1);
    vi.setSystemTime(new Date(now.getTime() + 60 * 60 * 1000 + 1000));
    const staleResult = await provider.getDisplayAmount(req);
    expect(staleResult.warnings).toContain('FX rate is stale; showing last known value.');
    await vi.runAllTimersAsync();
    expect(hitCount).toBe(2);
    vi.useRealTimers();
  });
});