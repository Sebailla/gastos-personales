import { describe, it, expectTypeOf } from 'vitest';
import type { DolarApiPort } from './dolar-api.port';
import type { FxRateCachePort, FxRateCacheEntry } from './fx-rate-cache.port';
import type { FxCasaString } from '../entities/fx-casa-string.schema';

/**
 * Compile-time port-shape assertions. These tests have no
 * runtime body beyond `expectTypeOf`; they exist to lock the
 * method signatures so an accidental refactor (e.g. renaming
 * a method or changing a parameter type) breaks the build.
 *
 * They run under `vitest run` and contribute 0 lines to
 * coverage (the `coverage.exclude` list filters port files
 * out; see `vitest.config.ts`). Their value is the
 * type-level guarantee, not the runtime execution.
 */
describe('DolarApiPort contract', () => {
  it('declares getDolares(casa) returning a Promise of an FxQuote', () => {
    expectTypeOf<DolarApiPort['getDolares']>().toEqualTypeOf<
      (casa: FxCasaString) => Promise<{
        casa: FxCasaString;
        buy: number;
        sell: number;
        fxAsOf: string;
      }>
    >();
  });
});

describe('FxRateCachePort contract', () => {
  it('declares get(casa) returning a Promise of an entry-or-null', () => {
    expectTypeOf<FxRateCachePort['get']>().toEqualTypeOf<
      (casa: FxCasaString) => Promise<FxRateCacheEntry | null>
    >();
  });

  it('declares set(casa, entry) returning a Promise of void', () => {
    expectTypeOf<FxRateCachePort['set']>().toEqualTypeOf<
      (casa: FxCasaString, entry: FxRateCacheEntry) => Promise<void>
    >();
  });

  it('FxRateCacheEntry carries quote + cachedAt', () => {
    expectTypeOf<FxRateCacheEntry>().toMatchTypeOf<{
      quote: { casa: FxCasaString; buy: number; sell: number; fxAsOf: string };
      cachedAt: string;
    }>();
  });
});
