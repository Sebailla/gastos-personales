/**
 * Tests for getAccountAction.
 *
 * 2 cases: happy path (200) + NOT_FOUND (404).
 */

import { describe, it, expect, vi } from "vitest";
import { assertOk, assertFail } from "./_narrow";
import { getAccountAction } from './get-account.action';
import type { AccountActionDeps } from './_shared';
import {
  AccountCurrency,
  AccountKind,
  AccountType,
  OpeningBalanceMode,
  type FinancialAccount,
} from '../../domain/entities/financial-account';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

function makeRow(): FinancialAccount {
  return {
    id: 'fa-1',
    userId: 'u-1',
    type: AccountType.BANK,
    name: 'Main',
    currency: AccountCurrency.USD,
    openingBalanceMinor: 0,
    openingBalanceMode: OpeningBalanceMode.FRESH,
    openingBalanceDate: null,
    archivedAt: null,
    bankName: 'ICBC',
    accountKind: AccountKind.SAVINGS,
    issuer: null,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    broker: null,
    investmentType: null,
    walletAddress: null,
    casa: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('getAccountAction', () => {
  it('returns 200 with the row when found', async () => {
    const row = makeRow();
    const deps: AccountActionDeps = {
      accountService: {
        getById: vi.fn(async () => row),
      } as never,
    };
    const result = await getAccountAction(deps, 'u-1', 'fa-1');
    assertOk(result);
    expect(result.data.id).toBe('fa-1');
  });

  it('returns 404 when the service throws NOT_FOUND', async () => {
    const deps: AccountActionDeps = {
      accountService: {
        getById: vi.fn(async () => {
          throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'not found' });
        }),
      } as never,
    };
    const result = await getAccountAction(deps, 'u-1', 'missing');
    assertFail(result);
    expect(result.status).toBe(404);
    expect(result.error.code).toBe(ErrorCode.NOT_FOUND);
  });
});
