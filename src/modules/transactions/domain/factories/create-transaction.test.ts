import { describe, it, expect } from 'vitest';
import {
  AccountCurrency,
  AccountFxCasa,
  TransactionDirection,
  type NewTransactionInput,
} from '../entities/transaction';
import { createTransaction } from '../factories/create-transaction';
import {
  InvalidAmountError,
  InvalidDirectionError,
  FutureTransactionDateError,
} from '../entities/transaction.errors';

/**
 * RED: createTransaction factory contract (6 cases).
 *
 * Slice 1 lock: the factory in `create-transaction.ts` is the
 * SINGLE place that constructs a new `Transaction` aggregate. The
 * factory:
 *  - accepts a `NewTransactionInput` (the 14 fields + `now`);
 *  - enforces the 3 domain invariants (BR-TX-1, BR-TX-2, BR-TX-3);
 *  - sets `createdAt = updatedAt = input.now`;
 *  - attaches the `equals` and `withUpdates` instance methods;
 *  - returns a fully-formed aggregate.
 *
 * The test imports through the top-level module path so the
 * RED state is "module not found" (Vite returns 0 tests, the
 * file fails to load). The GREEN state is "all 6 cases pass".
 *
 * Branches:
 *  1. happy path: returns a `Transaction` with all 14 fields
 *  2. sets `createdAt = updatedAt = input.now`
 *  3. attaches `equals` and `withUpdates` methods (callable)
 *  4. BR-TX-1: rejects `amountMinor <= 0` with `InvalidAmountError`
 *  5. BR-TX-2: rejects `direction === TRANSFER` with
 *     `InvalidDirectionError`
 *  6. BR-TX-3: rejects future `transactionDate` with
 *     `FutureTransactionDateError`
 */
describe('createTransaction factory contract', () => {
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

  it('happy path: returns a Transaction with all 14 fields populated', () => {
    const tx = createTransaction(validInput);
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
  });

  it('sets createdAt = updatedAt = input.now', () => {
    const tx = createTransaction(validInput);
    expect(tx.createdAt).toEqual(now);
    expect(tx.updatedAt).toEqual(now);
  });

  it('attaches equals and withUpdates methods on the returned aggregate', () => {
    const tx = createTransaction(validInput);
    expect(typeof tx.equals).toBe('function');
    expect(typeof tx.withUpdates).toBe('function');
    // equals returns true for the same input built twice.
    const same = createTransaction(validInput);
    expect(tx.equals(same)).toBe(true);
  });

  it('BR-TX-1: rejects amountMinor <= 0 with InvalidAmountError', () => {
    expect(() => createTransaction({ ...validInput, amountMinor: 0 })).toThrow(InvalidAmountError);
    expect(() => createTransaction({ ...validInput, amountMinor: -100 })).toThrow(
      InvalidAmountError,
    );
  });

  it('BR-TX-2: rejects direction === TRANSFER with InvalidDirectionError', () => {
    expect(() =>
      createTransaction({ ...validInput, direction: TransactionDirection.TRANSFER }),
    ).toThrow(InvalidDirectionError);
  });

  it('BR-TX-3: rejects future transactionDate with FutureTransactionDateError', () => {
    expect(() => createTransaction({ ...validInput, transactionDate: later })).toThrow(
      FutureTransactionDateError,
    );
  });
});
