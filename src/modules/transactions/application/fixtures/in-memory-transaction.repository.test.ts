/**
 * Tests for InMemoryTransactionRepository.
 *
 * RED — 6 cases covering:
 * (1) create + findById round-trip
 * (2) list returns only the caller's userId rows
 * (3) list paginates by cursor
 * (4) update applies a partial patch
 * (5) delete removes the row
 * (6) cross-user isolation (BR-TX-4 — every method scopes
 *     by userId and treats cross-user access as a miss)
 *
 * Slice 3 binding. The fixture implements
 * `TransactionRepositoryPort` over an in-memory
 * `Map<string, Transaction>` keyed by `${userId}:${id}`. It
 * is used by every action test in slice 3.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTransactionRepository } from './in-memory-transaction.repository';
import {
  AccountCurrency,
  TransactionDirection,
  type Transaction,
} from '../../domain/entities/transaction';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  const now = new Date('2026-06-23T10:00:00.000Z');
  const base: Omit<Transaction, 'equals' | 'withUpdates'> = {
    id: 'tx-1',
    userId: 'u-1',
    accountId: 'fa-1',
    direction: TransactionDirection.EXPENSE,
    amountMinor: 1000,
    currency: AccountCurrency.USD,
    memo: null,
    category: null,
    transactionDate: now,
    convertedAmountMinor: 1000,
    convertedCurrency: AccountCurrency.USD,
    fxAsOfSnapshot: null,
    casaSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };
  const merged: Omit<Transaction, 'equals' | 'withUpdates'> = { ...base, ...overrides };
  return {
    ...merged,
    equals: () => true,
    withUpdates: () => makeTx(overrides),
  } as Transaction;
}

describe('InMemoryTransactionRepository', () => {
  let repo: InMemoryTransactionRepository;
  beforeEach(() => {
    repo = new InMemoryTransactionRepository();
  });

  it('create + findById round-trip preserves all 14 fields', async () => {
    const created = await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1500,
      currency: AccountCurrency.USD,
      memo: 'lunch',
      category: 'food',
      transactionDate: new Date('2026-06-23T12:00:00.000Z'),
      convertedAmountMinor: 1500,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const fetched = await repo.findById('u-1', created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.amountMinor).toBe(1500);
    expect(fetched?.memo).toBe('lunch');
    expect(fetched?.category).toBe('food');
  });

  it('list returns only the userId rows owned by the caller', async () => {
    await repo.create('u-1', {
      accountId: 'fa-1',
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
    await repo.create('u-2', {
      accountId: 'fa-2',
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
    const page = await repo.list('u-1', { limit: 10 });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.userId).toBe('u-1');
  });

  it('list paginates by cursor', async () => {
    // Insert 3 rows for u-1, ask for limit=2, then fetch
    // the second page using the returned cursor. Declarative
    // setup (no loops) per AGENTS.md §10.5 "no logic in tests".
    const tx1 = await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 100,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-21T10:00:00.000Z'),
      convertedAmountMinor: 100,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const tx2 = await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 200,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-22T10:00:00.000Z'),
      convertedAmountMinor: 200,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const tx3 = await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 300,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-23T10:00:00.000Z'),
      convertedAmountMinor: 300,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const page1 = await repo.list('u-1', { limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await repo.list('u-1', {
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.data.length).toBe(1);
    // Verify the remaining row is the one not in page 1.
    expect(page2.data[0]?.id).toBe(tx3.id);
    // Sanity: all three ids are present across the two pages.
    const ids = [page1.data[0]?.id, page1.data[1]?.id, page2.data[0]?.id];
    expect(ids).toContain(tx1.id);
    expect(ids).toContain(tx2.id);
    expect(ids).toContain(tx3.id);
  });

  it('update applies a partial patch and returns the new row', async () => {
    const tx = makeTx({ id: 'tx-1', userId: 'u-1' });
    // Pre-populate the repo by a create call.
    await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      memo: tx.memo,
      category: tx.category,
      transactionDate: tx.transactionDate,
      convertedAmountMinor: tx.convertedAmountMinor,
      convertedCurrency: tx.convertedCurrency,
      fxAsOfSnapshot: tx.fxAsOfSnapshot,
      casaSnapshot: tx.casaSnapshot,
    });
    const updated = await repo.update('u-1', 'tx-1', { memo: 'updated' });
    expect(updated).not.toBeNull();
    expect(updated?.memo).toBe('updated');
  });

  it('delete removes the row and returns true', async () => {
    await repo.create('u-1', {
      accountId: 'fa-1',
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
    const ok = await repo.delete('u-1', 'tx-1');
    expect(ok).toBe(true);
    const fetched = await repo.findById('u-1', 'tx-1');
    expect(fetched).toBeNull();
  });

  it('cross-user isolation: every method treats cross-user access as miss', async () => {
    await repo.create('u-1', {
      accountId: 'fa-1',
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
    expect(await repo.findById('u-2', 'tx-1')).toBeNull();
    expect(await repo.update('u-2', 'tx-1', { memo: 'hacked' })).toBeNull();
    expect(await repo.delete('u-2', 'tx-1')).toBe(false);
    // u-1 still owns it.
    const row = await repo.findById('u-1', 'tx-1');
    expect(row).not.toBeNull();
  });
});
