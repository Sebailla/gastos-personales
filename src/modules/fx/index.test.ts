import { describe, it, expect } from 'vitest';
import { type FxQuote } from './domain/entities/fx-quote';
import { fxCasaStringSchema, FX_CASAS } from './domain/entities/fx-casa-string.schema';
import { FxRateProviderDolarApi } from './infrastructure/external/fx-rate-provider.dolar-api';
import { DolarApiClient } from './infrastructure/external/dolar-api.client';
import { UpstashFxRateCache } from './infrastructure/cache/upstash-fx-rate.cache';
import { withLock } from './infrastructure/stampede/stampede-lock';
import * as publicApi from './index';

describe('@/modules/fx public surface', () => {
  it('re-exports FxRateProviderDolarApi from the barrel', () => {
    expect(publicApi.FxRateProviderDolarApi).toBe(FxRateProviderDolarApi);
  });

  it('re-exports fxCasaStringSchema + FX_CASAS + the FxCasaString type from the barrel', () => {
    expect(publicApi.fxCasaStringSchema).toBe(fxCasaStringSchema);
    expect(publicApi.FX_CASAS).toBe(FX_CASAS);
    const casa: publicApi.FxCasaString = 'oficial';
    expect(casa).toBe('oficial');
  });

  it('re-exports FxQuote (the value-object type) from the barrel', () => {
    const quote: FxQuote = {
      casa: 'blue',
      buy: 1100,
      sell: 1140,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    };
    expect(quote.casa).toBe('blue');
  });

  it('re-exports DolarApiClient, UpstashFxRateCache, and withLock for DI composition', () => {
    expect(publicApi.DolarApiClient).toBe(DolarApiClient);
    expect(publicApi.UpstashFxRateCache).toBe(UpstashFxRateCache);
    expect(publicApi.withLock).toBe(withLock);
  });
});