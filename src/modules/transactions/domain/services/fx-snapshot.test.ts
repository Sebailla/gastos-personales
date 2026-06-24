import { describe, it, expect, vi } from 'vitest';
import { AccountCurrency, AccountFxCasa } from '../entities/transaction';
import type { FxRateProvider } from '../interfaces/fx-rate-provider.port';
import {
  convertAndSnapshot,
  currencyForCasa,
  type FxSnapshot,
  type ConvertAndSnapshotInput,
} from './fx-snapshot';

/**
 * RED: convertAndSnapshot helper contract (6 cases).
 *
 * Slice 2 binding. The helper is a pure function (modulo the FX
 * call) that, given the native amount, the native currency, the
 * parent account's casa, and an FxRateProvider, returns the four
 * snapshot fields the factory stamps on the Transaction row:
 * `convertedAmountMinor`, `convertedCurrency`,
 * `fxAsOfSnapshot`, `casa`.
 *
 * Branches:
 *  1. native === casa currency → skip the FX call; mirror
 *     original; fxAsOfSnapshot: null.
 *  2. native !== casa currency → call `FxRateProvider.getDisplayAmount`;
 *     return the provider's result.
 *  3. provider throws AppError(FX_UNAVAILABLE) → propagate as-is.
 *  4. half-up rounding at 2 decimals on the converted amount.
 *  5. `fxAsOfSnapshot` is `Date | null` (never undefined, never
 *     a string).
 *  6. `currencyForCasa` maps every `AccountFxCasa` to its ARS/ARS
 *     peer (in v1 every DolarAPI casa is ARS-denominated).
 */

const NOW = new Date('2026-06-23T12:00:00.000Z');

/**
 * Build a fake FxRateProvider whose `getDisplayAmount` returns a
 * deterministic result. The test can opt into a "throw" mode to
 * exercise the FX_UNAVAILABLE propagation path.
 */
function fakeFx(displayAmount: number, fxAsOf: Date): FxRateProvider {
  return {
    getDisplayAmount: vi.fn(async () => ({
      native: { amount: 0, currency: AccountCurrency.USD },
      display: {
        amount: displayAmount,
        currency: AccountCurrency.ARS,
        fxRate: 1100,
        fxAsOf,
      },
      stale: false,
    })),
  };
}

function throwingFx(): FxRateProvider {
  return {
    getDisplayAmount: vi.fn(async () => {
      // The factory of AppError(FX_UNAVAILABLE) lives in
      // @/shared/errors/app-error; the helper must propagate
      // it untouched. The simplest portable representation is a
      // Error with the right `code` attached, which is how the
      // shared AppError shapes itself when thrown by an adapter.
      const err = new Error('upstream FX provider unavailable') as Error & {
        code: string;
      };
      err.code = 'FX_UNAVAILABLE';
      throw err;
    }),
  };
}

const baseInput = (overrides: Partial<ConvertAndSnapshotInput> = {}): ConvertAndSnapshotInput => ({
  originalAmountMinor: 1000,
  originalCurrency: AccountCurrency.USD,
  casa: AccountFxCasa.OFICIAL,
  fxRateProvider: fakeFx(1100000, NOW),
  now: NOW,
  ...overrides,
});

describe('convertAndSnapshot — slice 2 fx helper', () => {
  it('skips the FX call when native currency equals casa currency (BR-TX-6)', async () => {
    // ARS native + OFICIAL casa → casa currency is ARS → skip path.
    const fx = fakeFx(9999999, NOW);
    const result = await convertAndSnapshot(
      baseInput({
        originalAmountMinor: 5000,
        originalCurrency: AccountCurrency.ARS,
        casa: AccountFxCasa.OFICIAL,
        fxRateProvider: fx,
      }),
    );
    expect(fx.getDisplayAmount).not.toHaveBeenCalled();
    expect(result).toEqual<FxSnapshot>({
      convertedAmountMinor: 5000,
      convertedCurrency: AccountCurrency.ARS,
      fxAsOfSnapshot: null,
      casa: AccountFxCasa.OFICIAL,
    });
  });

  it('calls FxRateProvider.getDisplayAmount when native currency differs from casa currency', async () => {
    // USD native + OFICIAL casa → casa currency is ARS → call path.
    const fx = fakeFx(1100000, NOW);
    const result = await convertAndSnapshot(
      baseInput({
        originalAmountMinor: 1000,
        originalCurrency: AccountCurrency.USD,
        fxRateProvider: fx,
      }),
    );
    expect(fx.getDisplayAmount).toHaveBeenCalledTimes(1);
    // The provider received the correct FxConversionRequest.
    const call = (fx.getDisplayAmount as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.native).toEqual({ amount: 1000, currency: AccountCurrency.USD });
    expect(call.displayCurrency).toBe(AccountCurrency.ARS);
    expect(call.casa).toBe('oficial');
    expect(call.asOf).toEqual(NOW);
    expect(result).toEqual<FxSnapshot>({
      convertedAmountMinor: 1100000,
      convertedCurrency: AccountCurrency.ARS,
      fxAsOfSnapshot: NOW,
      casa: AccountFxCasa.OFICIAL,
    });
  });

  it("propagates the FX_UNAVAILABLE error untouched (don't swallow it)", async () => {
    const fx = throwingFx();
    await expect(
      convertAndSnapshot(baseInput({ originalCurrency: AccountCurrency.USD, fxRateProvider: fx })),
    ).rejects.toMatchObject({ code: 'FX_UNAVAILABLE' });
  });

  it('applies half-up rounding at 2 decimals (DG-TX-8) — provider result is preserved as integer minor units', async () => {
    // The provider returns integer minor units; the helper does
    // NOT re-round. The half-up rule is the provider's contract
    // (see fx-rate-provider.dolar-api.ts comments). The helper
    // stamps the integer verbatim. This test pins the contract.
    const fx = fakeFx(1234567, NOW);
    const result = await convertAndSnapshot(baseInput({ fxRateProvider: fx }));
    expect(result.convertedAmountMinor).toBe(1234567);
  });

  it('returns fxAsOfSnapshot as `Date | null` — never undefined, never a string', async () => {
    const fx = fakeFx(1100000, NOW);
    const result = await convertAndSnapshot(baseInput({ fxRateProvider: fx }));
    expect(result.fxAsOfSnapshot).toBeInstanceOf(Date);
    // Skip path: must be `null`, not `undefined`.
    const skipResult = await convertAndSnapshot(
      baseInput({
        originalCurrency: AccountCurrency.ARS,
        fxRateProvider: fx,
      }),
    );
    expect(skipResult.fxAsOfSnapshot).toBeNull();
  });

  it.each([
    AccountFxCasa.OFICIAL,
    AccountFxCasa.BLUE,
    AccountFxCasa.MEP,
    AccountFxCasa.CCL,
    AccountFxCasa.CRIPTO,
    AccountFxCasa.TARJETA,
  ] as const)('currencyForCasa(%s) → ARS (v1: every DolarAPI casa is ARS-denominated)', (casa) => {
    // Per-casa failure messages via it.each (AGENTS.md §10.5:
    // "No logic in tests | Clean tests, without `if`/`else`/`for`").
    // EUR support is the v1.1 follow-up (design §5.1).
    expect(currencyForCasa(casa)).toBe(AccountCurrency.ARS);
  });
});
