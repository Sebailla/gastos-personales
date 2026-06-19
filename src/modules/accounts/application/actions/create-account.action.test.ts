/**
 * Tests for createAccountAction.
 *
 * 2 cases: happy path (201) + NAME_TAKEN (409).
 */

import { describe, it, expect, vi } from "vitest";
import { assertOk, assertFail } from "./_narrow";
import { createAccountAction } from './create-account.action';
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
    id: 'fa-new',
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('createAccountAction', () => {
  it('returns 201 on a valid BANK body', async () => {
    const row = makeRow();
    const deps: AccountActionDeps = {
      accountService: {
        create: vi.fn(async () => row),
      } as never,
    };
    const result = await createAccountAction(deps, 'u-1', {
      type: AccountType.BANK,
      name: 'Main',
      currency: AccountCurrency.USD,
      openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: 0 },
      bankName: 'ICBC',
      accountKind: AccountKind.SAVINGS,
    });
    assertOk(result);
    expect(result.data.id).toBe('fa-new');
  });

  it('returns 400 on a malformed body', async () => {
    const deps: AccountActionDeps = {
      accountService: { create: vi.fn() } as never,
    };
    const result = await createAccountAction(deps, 'u-1', {
      type: AccountType.BANK,
      name: '',
    });
    assertFail(result);
    expect(result.status).toBe(400);
    expect(result.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('returns 409 when the service throws NAME_TAKEN', async () => {
    const deps: AccountActionDeps = {
      accountService: {
        create: vi.fn(async () => {
          throw new AppError({ code: ErrorCode.NAME_TAKEN, message: 'taken' });
        }),
      } as never,
    };
    const result = await createAccountAction(deps, 'u-1', {
      type: AccountType.BANK,
      name: 'Main',
      currency: AccountCurrency.USD,
      openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: 0 },
      bankName: 'ICBC',
      accountKind: AccountKind.SAVINGS,
    });
    assertFail(result);
    expect(result.status).toBe(409);
    expect(result.error.code).toBe(ErrorCode.NAME_TAKEN);
  });
});
