/**
 * Tests for getAccountBalanceAction.
 *
 * 3 cases: happy path (200) + FX_UNAVAILABLE (503) + FX_NOT_SUPPORTED (409).
 */

import { describe, it, expect, vi } from "vitest";
import { assertOk, assertFail } from "./_narrow";
import { getAccountBalanceAction } from './get-account-balance.action';
import type { AccountActionDeps } from './_shared';
import { AccountCurrency } from '../../domain/entities/financial-account';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { FxConversionResult } from '../../domain/interfaces/fx-rate-provider.port';

const successResult: FxConversionResult = {
  native: { amount: 100000, currency: AccountCurrency.USD },
  display: {
    amount: 92000,
    currency: AccountCurrency.EUR,
    fxRate: 0.92,
    fxAsOf: new Date('2026-06-18T20:00:00.000Z'),
  },
  warnings: [],
};

describe('getAccountBalanceAction', () => {
  it('returns 200 with the conversion on success', async () => {
    const deps: AccountActionDeps = {
      accountService: { getBalance: vi.fn(async () => successResult) } as never,
    };
    const result = await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    assertOk(result);
    expect(result.data.display.amount).toBe(92000);
      expect(result.data.display.fxRate).toBe(0.92);
  });

  it('returns 503 when the service throws FX_UNAVAILABLE', async () => {
    const deps: AccountActionDeps = {
      accountService: {
        getBalance: vi.fn(async () => {
          throw new AppError({
            code: ErrorCode.FX_UNAVAILABLE,
            message: 'no provider',
          });
        }),
      } as never,
    };
    const result = await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    assertFail(result);
    expect(result.status).toBe(503);
  });

  it('returns 409 when the service throws FX_NOT_SUPPORTED', async () => {
    const deps: AccountActionDeps = {
      accountService: {
        getBalance: vi.fn(async () => {
          throw new AppError({
            code: ErrorCode.FX_NOT_SUPPORTED,
            message: 'not supported',
          });
        }),
      } as never,
    };
    const result = await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    assertFail(result);
    expect(result.status).toBe(409);
  });

  it('returns 400 on a missing displayCurrency', async () => {
    const deps: AccountActionDeps = {
      accountService: { getBalance: vi.fn() } as never,
    };
    const result = await getAccountBalanceAction(deps, 'u-1', 'fa-1', {});
    assertFail(result);
    expect(result.status).toBe(400);
  });
});
