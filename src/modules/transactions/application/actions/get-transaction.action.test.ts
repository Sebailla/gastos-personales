/**
 * Tests for getTransactionAction.
 *
 * RED — 3 cases covering:
 * (1) found returns the DTO (200)
 * (2) cross-user returns NOT_FOUND (BR-TX-4)
 * (3) missing returns NOT_FOUND
 *
 * Slice 3 binding. Cross-user access is indistinguishable
 * from a miss at the repository layer (BR-TX-4); the action
 * maps the null result to `AppError(NOT_FOUND)`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTransactionAction } from './get-transaction.action';
import { InMemoryTransactionRepository } from '../fixtures/in-memory-transaction.repository';
import { assertOk, assertFail } from './_narrow';
import type { TransactionActionDeps } from './_shared';
import { AccountCurrency, TransactionDirection } from '../../domain/entities/transaction';
import { logger } from '@/shared/logger/logger';
import { dispatcher } from '@/shared/events/event-dispatcher';
import type { FxRateProvider } from '../../domain/interfaces/fx-rate-provider.port';

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

describe('getTransactionAction', () => {
  let deps: TransactionActionDeps;
  let repo: InMemoryTransactionRepository;
  beforeEach(() => {
    ({ deps, repo } = makeDeps());
  });

  it('returns the DTO when the row is found', async () => {
    const created = await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.USD,
      memo: 'lunch',
      category: 'food',
      transactionDate: new Date('2026-06-23T10:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const result = await getTransactionAction(deps, 'u-1', created.id);
    assertOk(result);
    expect(result.value.id).toBe(created.id);
    expect(result.value.memo).toBe('lunch');
  });

  it('returns NOT_FOUND on cross-user access', async () => {
    const created = await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.USD,
      memo: 'lunch',
      category: null,
      transactionDate: new Date('2026-06-23T10:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const result = await getTransactionAction(deps, 'u-2', created.id);
    assertFail(result);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND when the row is missing', async () => {
    const result = await getTransactionAction(deps, 'u-1', 'tx-does-not-exist');
    assertFail(result);
    expect(result.error.code).toBe('NOT_FOUND');
  });
});
