/**
 * Tests for deleteTransactionAction.
 *
 * RED — 3 cases covering:
 * (1) delete returns the row's id on success (204 path)
 * (2) NOT_FOUND on missing row
 * (3) NOT_FOUND on cross-user access (BR-TX-4)
 *
 * Slice 3 binding. Hard delete (DG-TX-15). The action maps
 * the repository's `boolean` to either `{ ok: true, value: { id } }`
 * or `{ ok: false, error: { code: NOT_FOUND } }`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteTransactionAction } from './delete-transaction.action';
import { InMemoryTransactionRepository } from '../fixtures/in-memory-transaction.repository';
import { assertOk, assertFail } from './_narrow';
import type { TransactionActionDeps } from './_shared';
import { AccountCurrency } from '@/shared/domain-kernel';
import { TransactionDirection } from '../../domain/entities/transaction';
import { logger } from '@/shared/logger/logger';
import { dispatcher } from '@/shared/events/event-dispatcher';
import type { FxRateProvider } from '@/shared/domain-kernel';

const ACCOUNT_ID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

function makeDeps(): {
  deps: TransactionActionDeps;
  repo: InMemoryTransactionRepository;
} {
  const repo = new InMemoryTransactionRepository();
  const fakeFx: FxRateProvider = {
    getDisplayAmount: vi.fn(),
  };
  const deps: TransactionActionDeps = {
    repo,
    clock: () => new Date('2026-06-23T10:00:00.000Z'),
    logger,
    dispatcher,
    fxRateProvider: fakeFx,
  };
  return { deps, repo };
}

describe('deleteTransactionAction', () => {
  let deps: TransactionActionDeps;
  let repo: InMemoryTransactionRepository;
  beforeEach(() => {
    ({ deps, repo } = makeDeps());
  });

  it('returns the id on successful delete', async () => {
    const created = await repo.create('u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-23T10:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const result = await deleteTransactionAction(deps, 'u-1', created.id);
    assertOk(result);
    expect(result.value.id).toBe(created.id);
    // Follow-up fetch returns null (row is gone).
    const fetched = await repo.findById('u-1', created.id);
    expect(fetched).toBeNull();
  });

  it('returns NOT_FOUND when the row is missing', async () => {
    const result = await deleteTransactionAction(deps, 'u-1', 'tx-missing');
    assertFail(result);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND on cross-user access', async () => {
    const created = await repo.create('u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-23T10:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const result = await deleteTransactionAction(deps, 'u-2', created.id);
    assertFail(result);
    expect(result.error.code).toBe('NOT_FOUND');
  });
});
