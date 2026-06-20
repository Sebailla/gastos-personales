/**
 * Tests for listAccountsAction.
 *
 * Cases: happy path (200) + validation failure (400) +
 * the N1 contract (total comes from the repository count,
 * not the page length).
 */

import { describe, it, expect, vi } from 'vitest';
import { assertOk, assertFail } from './_narrow';
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

function makeDeps(rows: FinancialAccount[] = [], total = rows.length): AccountActionDeps {
  return {
    accountService: {
      list: vi.fn(async () => ({ data: rows, nextCursor: null })),
      count: vi.fn(async () => total),
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

  it('reports total from the repository count, not the page length (N1)', async () => {
    // 60 rows in storage, but the page only contains 20.
    // The action must return total = 60, not 20.
    const pageRows = Array.from({ length: 20 }, (_, i) => makeRow({ id: `fa-${i + 1}` }));
    const deps = makeDeps(pageRows, 60);
    const result = await listAccountsAction(deps, 'u-1', { limit: '20' });
    assertOk(result);
    expect(result.data.data).toHaveLength(20);
    expect(result.data.total).toBe(60);
  });

  it('passes the same filter to list and count (F-12)', async () => {
    // The same `archivedAt: null` filter must reach both
    // service methods; otherwise `total` could lie.
    const deps = makeDeps();
    await listAccountsAction(deps, 'u-1', { limit: '20', archivedAt: 'null' });
    const listMock = deps.accountService.list as unknown as ReturnType<typeof vi.fn>;
    const countMock = deps.accountService.count as unknown as ReturnType<typeof vi.fn>;
    expect(listMock).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ archivedAt: null, limit: 20 }),
    );
    expect(countMock).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ archivedAt: null, limit: 20 }),
    );
  });

  it('returns the list with no total when count throws (F-13)', async () => {
    // The list is the critical data; a transient count
    // failure must NOT take down the list view.
    const row = makeRow();
    const accountService = {
      list: vi.fn(async () => ({ data: [row], nextCursor: null })),
      count: vi.fn(async () => {
        throw new Error('transient db blip');
      }),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      getBalance: vi.fn(),
    } as never;
    const deps: AccountActionDeps = { accountService };
    const result = await listAccountsAction(deps, 'u-1', { limit: '20' });
    assertOk(result);
    expect(result.data.data).toHaveLength(1);
    expect(result.data.total).toBeUndefined();
  });
});
