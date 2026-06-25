import { describe, it, expect } from 'vitest';
import { AccountCurrency, AccountFxCasa } from '@/shared/domain-kernel';
import {
  type NewTransactionInput,
  TransactionDirection,
  type Transaction,
} from '../entities/transaction';
import { createTransaction } from '../factories/create-transaction';

/**
 * RED: Transaction aggregate invariants (8 cases).
 *
 * Slice 1 lock: the `Transaction` aggregate is the source of truth
 * for the user's ledger entries. The aggregate holds 14 readonly
 * fields, exposes `equals` (value equality) and `withUpdates` (patch
 * + advance `updatedAt`), and is constructed through the pure factory
 * `createTransaction(input)`. The factory enforces the 3 domain
 * invariants — `amountMinor > 0`, `direction` is `INCOME | EXPENSE`,
 * `transactionDate <= now`. The aggregate itself is just a typed
 * shape + helper methods.
 *
 * Branches:
 *  1. factory builds a 14-field aggregate from a valid input
 *  2. factory rejects zero amountMinor (BR-TX-1)
 *  3. factory rejects negative amountMinor (BR-TX-1)
 *  4. factory rejects TRANSFER direction at the boundary (BR-TX-2)
 *  5. factory rejects future transactionDate (BR-TX-3)
 *  6. factory accepts a same-currency snapshot (fxAsOfSnapshot = null)
 *  7. `equals` returns true for identical fields, false for any diff
 *  8. `withUpdates` returns a new aggregate + advances updatedAt
 */
describe('Transaction aggregate invariants', () => {
  const now = new Date('2026-06-22T12:00:00.000Z');
  const earlier = new Date('2026-06-22T10:00:00.000Z');
  const later = new Date('2026-06-22T14:00:00.000Z');

  const validInput: NewTransactionInput = {
    id: 'tx-1',
    userId: 'u-1',
    accountId: 'fa-1',
    direction: TransactionDirection.EXPENSE,
    amountMinor: 1000,
    currency: AccountCurrency.USD,
    memo: 'coffee',
    category: null,
    transactionDate: earlier,
    convertedAmountMinor: 1100000,
    convertedCurrency: AccountCurrency.ARS,
    fxAsOfSnapshot: now,
    casaSnapshot: AccountFxCasa.OFICIAL,
    now,
  };

  it('factory builds a 14-field aggregate from a valid input', async () => {
    const tx = await createTransaction(validInput);
    // 14 readonly fields per the slice contract.
    expect(tx.id).toBe('tx-1');
    expect(tx.userId).toBe('u-1');
    expect(tx.accountId).toBe('fa-1');
    expect(tx.direction).toBe(TransactionDirection.EXPENSE);
    expect(tx.amountMinor).toBe(1000);
    expect(tx.currency).toBe(AccountCurrency.USD);
    expect(tx.memo).toBe('coffee');
    expect(tx.category).toBeNull();
    expect(tx.transactionDate).toEqual(earlier);
    expect(tx.convertedAmountMinor).toBe(1100000);
    expect(tx.convertedCurrency).toBe(AccountCurrency.ARS);
    expect(tx.fxAsOfSnapshot).toEqual(now);
    expect(tx.casaSnapshot).toBe(AccountFxCasa.OFICIAL);
    expect(tx.createdAt).toEqual(now);
    expect(tx.updatedAt).toEqual(now);
  });

  it('factory rejects zero amountMinor (BR-TX-1)', async () => {
    await expect(createTransaction({ ...validInput, amountMinor: 0 })).rejects.toThrow(/amount/i);
  });

  it('factory rejects negative amountMinor (BR-TX-1)', async () => {
    await expect(createTransaction({ ...validInput, amountMinor: -100 })).rejects.toThrow(
      /amount/i,
    );
  });

  it('factory rejects TRANSFER direction at the boundary (BR-TX-2)', async () => {
    await expect(
      createTransaction({ ...validInput, direction: TransactionDirection.TRANSFER }),
    ).rejects.toThrow(/transfer/i);
  });

  it('factory rejects future transactionDate (BR-TX-3)', async () => {
    await expect(createTransaction({ ...validInput, transactionDate: later })).rejects.toThrow(
      /future/i,
    );
  });

  it('factory accepts a same-currency snapshot (fxAsOfSnapshot = null)', async () => {
    // BR-TX-6: when native == casa currency, the snapshot is
    // skipped. The factory accepts a fully-null snapshot pair.
    const tx = await createTransaction({
      ...validInput,
      currency: AccountCurrency.ARS,
      convertedCurrency: AccountCurrency.ARS,
      convertedAmountMinor: 1000,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    expect(tx.fxAsOfSnapshot).toBeNull();
    expect(tx.casaSnapshot).toBeNull();
    expect(tx.convertedAmountMinor).toBe(1000);
  });

  it('equals returns true for identical fields and false when id differs', async () => {
    const a = await createTransaction(validInput);
    const c = await createTransaction(validInput);
    const b = await createTransaction({ ...validInput, id: 'tx-2' });
    // Same id from the same input → equal.
    expect(a.equals(c)).toBe(true);
    // Different id → not equal.
    expect(a.equals(b)).toBe(false);
    // Mutated field → not equal.
    const mutated: Transaction = { ...a, amountMinor: 2000 };
    expect(a.equals(mutated)).toBe(false);
  });

  it('withUpdates returns a new aggregate, preserves id and createdAt, advances updatedAt', async () => {
    const a = await createTransaction(validInput);
    const advanceTime = new Date('2026-06-23T00:00:00.000Z');
    const next = a.withUpdates({ memo: 'updated' }, advanceTime);
    // New reference — immutability.
    expect(next).not.toBe(a);
    // Identity is preserved.
    expect(next.id).toBe(a.id);
    expect(next.userId).toBe(a.userId);
    expect(next.createdAt).toEqual(a.createdAt);
    // updatedAt advances to the injected clock.
    expect(next.updatedAt).toEqual(advanceTime);
  });
});
