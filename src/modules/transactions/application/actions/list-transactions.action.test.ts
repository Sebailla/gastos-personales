/**
 * Tests for listTransactionsAction.
 *
 * RED — 4 cases covering:
 * (1) empty list returns items: [] and nextCursor: null
 * (2) returns the user rows as DTOs
 * (3) cursor pagination (action forwards the cursor)
 * (4) accountId filter (REQ-TX-8)
 *
 * Slice 3 binding. The action reads the validated query,
 * calls the InMemoryTransactionRepository through the deps
 * bag, and returns `{ ok: true, value: { items: TransactionDTO[],
 * nextCursor } }`.
 *
 * Style: tests use the local `assertOk` / `assertFail` helpers
 * from `_narrow.ts` to narrow the discriminated union. The
 * helper centralises the `if (!result.ok) throw` branch — the
 * test body is a sequence of `expect()` calls with no
 * conditional logic. Mirrors the accounts action test pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listTransactionsAction } from './list-transactions.action';
import { InMemoryTransactionRepository } from '../fixtures/in-memory-transaction.repository';
import { assertOk } from './_narrow';
import type { TransactionActionDeps } from './_shared';
import { AccountCurrency } from '@/shared/domain-kernel';
import { TransactionDirection } from '../../domain/entities/transaction';
import { logger } from '@/shared/logger/logger';
import { dispatcher } from '@/shared/events/event-dispatcher';
import type { FxRateProvider } from '@/shared/domain-kernel';

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

describe('listTransactionsAction', () => {
  let deps: TransactionActionDeps;
  let repo: InMemoryTransactionRepository;
  beforeEach(() => {
    ({ deps, repo } = makeDeps());
  });

  it('empty list returns items: [] and nextCursor: null', async () => {
    const result = await listTransactionsAction(deps, 'u-1', { limit: 20 });
    assertOk(result);
    expect(result.value.items).toEqual([]);
    expect(result.value.nextCursor).toBeNull();
  });

  it('returns the user rows as DTOs', async () => {
    await repo.create('u-1', {
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
    const result = await listTransactionsAction(deps, 'u-1', { limit: 20 });
    assertOk(result);
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.memo).toBe('lunch');
    expect(result.value.items[0]?.direction).toBe(TransactionDirection.EXPENSE);
  });

  it('forwards the cursor to the next page', async () => {
    await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-21T10:00:00.000Z'),
      convertedAmountMinor: 1,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 2,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-22T10:00:00.000Z'),
      convertedAmountMinor: 2,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const result = await listTransactionsAction(deps, 'u-1', { limit: 1 });
    assertOk(result);
    expect(result.value.items).toHaveLength(1);
    expect(result.value.nextCursor).not.toBeNull();
  });

  it('filters by accountId when supplied', async () => {
    await repo.create('u-1', {
      accountId: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-23T10:00:00.000Z'),
      convertedAmountMinor: 1,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    await repo.create('u-1', {
      accountId: 'b2c3d4e5-f6a7-8901-2345-678901bcdef0',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 2,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-23T10:00:00.000Z'),
      convertedAmountMinor: 2,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const result = await listTransactionsAction(deps, 'u-1', {
      limit: 20,
      accountId: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    });
    assertOk(result);
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.accountId).toBe('a1b2c3d4-e5f6-7890-1234-567890abcdef');
  });
});
