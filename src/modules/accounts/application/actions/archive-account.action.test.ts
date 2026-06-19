/**
 * Tests for archiveAccountAction.
 */

import { describe, it, expect, vi } from "vitest";
import { assertOk, assertFail } from "./_narrow";
import { archiveAccountAction } from './archive-account.action';
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

function makeRow(archivedAt: Date | null = new Date()): FinancialAccount {
  return {
    id: 'fa-1',
    userId: 'u-1',
    type: AccountType.BANK,
    name: 'Main',
    currency: AccountCurrency.USD,
    openingBalanceMinor: 0,
    openingBalanceMode: OpeningBalanceMode.FRESH,
    openingBalanceDate: null,
    archivedAt,
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

describe('archiveAccountAction', () => {
  it('returns 200 with the row (archivedAt set)', async () => {
    const row = makeRow();
    const deps: AccountActionDeps = {
      accountService: { archive: vi.fn(async () => row) } as never,
    };
    const result = await archiveAccountAction(deps, 'u-1', 'fa-1');
    assertOk(result);
    expect(result.data.archivedAt).toBeInstanceOf(Date);
  });

  it('returns 404 when the service throws NOT_FOUND', async () => {
    const deps: AccountActionDeps = {
      accountService: {
        archive: vi.fn(async () => {
          throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'not found' });
        }),
      } as never,
    };
    const result = await archiveAccountAction(deps, 'u-1', 'missing');
    assertFail(result);
    expect(result.status).toBe(404);
  });
});
