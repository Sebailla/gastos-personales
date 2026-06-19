/**
 * Tests for listAccountsAction.
 *
 * 2 cases: happy path (200) + validation failure (400).
 */

import { describe, it, expect, vi } from "vitest";
import { assertOk, assertFail } from "./_narrow";
import { listAccountsAction } from './list-accounts.action';
import type { AccountActionDeps } from './_shared';
import {
  AccountCurrency,
  AccountKind,
  AccountType,
  OpeningBalanceMode,
  type FinancialAccount,
} from '../../domain/entities/financial-account';
import { ErrorCode } from '@/shared/errors/error-codes';

function makeRow(overrides: Partial<FinancialAccount> = {}): FinancialAccount {
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDeps(rows: FinancialAccount[] = []): AccountActionDeps {
  return {
    accountService: {
      list: vi.fn(async () => ({ data: rows, nextCursor: null })),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      getBalance: vi.fn(),
    } as never,
  };
}

describe('listAccountsAction', () => {
  it('returns 200 with the paginated list', async () => {
    const row = makeRow();
    const deps = makeDeps([row]);
    const result = await listAccountsAction(deps, 'u-1', { limit: '20' });
    assertOk(result);
    expect(result.data.data).toHaveLength(1);
      expect(result.data.data[0]?.id).toBe('fa-1');
      expect(result.data.nextCursor).toBeNull();
      expect(result.data.total).toBe(1);
  });

  it('returns 400 when the query is invalid', async () => {
    const deps = makeDeps();
    const result = await listAccountsAction(deps, 'u-1', { limit: '500' });
    assertFail(result);
    expect(result.status).toBe(400);
    expect(result.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });
});
