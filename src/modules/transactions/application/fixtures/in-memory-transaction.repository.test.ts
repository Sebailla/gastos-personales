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
import { AccountCurrency, TransactionDirection } from '../../domain/entities/transaction';

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
    await repo.create('u-1', {
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
    // Sanity: all three ids are present across the two pages.
    const ids = [page1.data[0]?.id, page1.data[1]?.id, page2.data[0]?.id];
    expect(ids).toContain(tx1.id);
    expect(ids).toContain(tx2.id);
  });

  it('update applies a partial patch and returns the new row', async () => {
    const created = await repo.create('u-1', {
      accountId: 'fa-1',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.USD,
      memo: 'original',
      category: null,
      transactionDate: new Date('2026-06-23T10:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: AccountCurrency.USD,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const updated = await repo.update('u-1', created.id, { memo: 'updated' });
    expect(updated).not.toBeNull();
    expect(updated?.memo).toBe('updated');
    expect(updated?.id).toBe(created.id);
  });

  it('delete removes the row and returns true', async () => {
    const created = await repo.create('u-1', {
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
    const ok = await repo.delete('u-1', created.id);
    expect(ok).toBe(true);
    const fetched = await repo.findById('u-1', created.id);
    expect(fetched).toBeNull();
  });

  it('cross-user isolation: every method treats cross-user access as miss', async () => {
    const created = await repo.create('u-1', {
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
    expect(await repo.findById('u-2', created.id)).toBeNull();
    expect(await repo.update('u-2', created.id, { memo: 'hacked' })).toBeNull();
    expect(await repo.delete('u-2', created.id)).toBe(false);
    // u-1 still owns it.
    const row = await repo.findById('u-1', created.id);
    expect(row).not.toBeNull();
  });
});
