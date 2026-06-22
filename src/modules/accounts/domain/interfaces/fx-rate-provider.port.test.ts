/**
 * Compile-time port-shape assertions for `FxRateProvider`.
 *
 * Locks the REQ-FX-3 invariant at the type level: every
 * `FxConversionRequest` MUST carry a fully-resolved `casa`
 * (lowercase DolarAPI form). The provider is not allowed
 * to consult `process.env.FX_DEFAULT_CASA` or the
 * `FinancialAccount.casa` column — the caller resolves the
 * value at the action site and forwards it on the wire.
 *
 * The technique: declare a function whose argument requires
 * a `RequiredCasa` subset. Calling it with an object missing
 * `casa` fails to typecheck. The runtime body never accesses
 * `.casa`; the assertion is purely type-level.
 *
 * These tests run under `vitest run` and contribute 0 lines
 * to coverage (the `coverage.exclude` list filters port files
 * out; see `vitest.config.ts`).
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  FxConversionRequest,
  FxConversionResult,
  FxRateProvider,
  FxCasaString,
} from './fx-rate-provider.port';
import type { AccountCurrency } from '../entities/financial-account';

describe('FxRateProvider port contract — fx-cache PR-3 T3.1', () => {
  it('declares FxCasaString as the lowercase DolarAPI enum', () => {
    // Type pin: only the six lowercase casas are valid.
    expectTypeOf<FxCasaString>().toEqualTypeOf<
      'oficial' | 'blue' | 'mep' | 'ccl' | 'cripto' | 'tarjeta'
    >();
  });

  it('FxConversionRequest.casa is required (not optional)', () => {
    // Declare a function whose argument requires `casa`. The
    // implementation never runs; the build fails at the call
    // site when the field is missing.
    type CasaCheck = (req: FxConversionRequest) => FxConversionRequest['casa'];
    const _check: CasaCheck = (req) => req.casa;
    void _check;
    expectTypeOf<FxConversionRequest['casa']>().toEqualTypeOf<FxCasaString>();
  });

  it('FxConversionRequest.casa is not nullable', () => {
    // `casa: FxCasaString | null` would let the caller hand a
    // null casa through; the port rejects that at the type
    // level so the action layer's `?? env.FX_DEFAULT_CASA`
    // resolution is the only path to an absent casa.
    type CasaField = FxConversionRequest['casa'];
    // The following assignment compiles only if the field is
    // exactly `FxCasaString` (no `| null`).
    const _pin: FxCasaString = null as unknown as CasaField;
    void _pin;
    expectTypeOf<CasaField>().toEqualTypeOf<FxCasaString>();
  });

  it('FxConversionResult exposes the existing native/display/warnings shape', () => {
    // Locked to make sure the PR-3 stale mapping does not
    // accidentally widen or rename fields. The PR-3 DTO
    // change lives in the application layer (`toBalanceDto`);
    // the domain port stays untouched on the shape side.
    expectTypeOf<FxConversionResult>().toMatchTypeOf<{
      native: { amount: number; currency: AccountCurrency };
      display: { amount: number; currency: AccountCurrency; fxRate: number; fxAsOf: Date };
      warnings?: readonly string[];
    }>();
  });

  it('FxRateProvider declares a single getDisplayAmount(request) method', () => {
    expectTypeOf<FxRateProvider['getDisplayAmount']>().toEqualTypeOf<
      (request: FxConversionRequest) => Promise<FxConversionResult>
    >();
  });
});
