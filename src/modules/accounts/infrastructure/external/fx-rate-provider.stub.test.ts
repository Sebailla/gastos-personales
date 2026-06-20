/**
 * Tests for FxRateProviderUnconfigured (always throws 503)
 * and FxRateProviderStub (configurable success / 503 / 409).
 */

import { describe, it, expect } from 'vitest';
import { FxRateProviderUnconfigured } from './fx-rate-provider.unconfigured';
import { FxRateProviderStub } from './fx-rate-provider.stub';
import { AccountCurrency } from '../../domain/entities/financial-account';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { FxConversionRequest } from '../../domain/interfaces/fx-rate-provider.port';

const sampleRequest: FxConversionRequest = {
  native: { amount: 100000, currency: AccountCurrency.USD },
  displayCurrency: AccountCurrency.EUR,
  asOf: new Date('2026-06-18T20:00:00.000Z'),
};

describe('FxRateProviderUnconfigured', () => {
  it('always throws AppError(FX_UNAVAILABLE) regardless of input', async () => {
    const stub = new FxRateProviderUnconfigured();
    await expect(stub.getDisplayAmount(sampleRequest)).rejects.toMatchObject({
      code: ErrorCode.FX_UNAVAILABLE,
      statusCode: 503,
    });
  });
});

describe('FxRateProviderStub', () => {
  it('returns the configured success result on success mode', async () => {
    const stub = new FxRateProviderStub();
    stub.setSuccessResult({
      native: { amount: 100000, currency: AccountCurrency.USD },
      display: {
        amount: 92000,
        currency: AccountCurrency.EUR,
        fxRate: 0.92,
        fxAsOf: new Date('2026-06-18T20:00:00.000Z'),
      },
    });
    const result = await stub.getDisplayAmount(sampleRequest);
    expect(result.display.amount).toBe(92000);
    expect(result.display.fxRate).toBe(0.92);
  });

  it('throws AppError(FX_UNAVAILABLE) when mode is "unavailable"', async () => {
    const stub = new FxRateProviderStub();
    stub.setMode('unavailable');
    await expect(stub.getDisplayAmount(sampleRequest)).rejects.toMatchObject({
      code: ErrorCode.FX_UNAVAILABLE,
    });
  });

  it('throws AppError(FX_NOT_SUPPORTED) when mode is "not-supported"', async () => {
    const stub = new FxRateProviderStub();
    stub.setMode('not-supported');
    await expect(stub.getDisplayAmount(sampleRequest)).rejects.toMatchObject({
      code: ErrorCode.FX_NOT_SUPPORTED,
      statusCode: 409,
    });
  });

  it('uses the default success conversion (0.92x) when no success result is set', async () => {
    const stub = new FxRateProviderStub();
    const result = await stub.getDisplayAmount(sampleRequest);
    expect(result.display.amount).toBe(92000);
    expect(result.display.fxRate).toBe(0.92);
  });
});
