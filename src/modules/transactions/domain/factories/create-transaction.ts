/**
 * Domain factory: `createTransaction`.
 *
 * The SINGLE place that constructs a new `Transaction` aggregate
 * (slice 1 lock). The factory:
 *
 *  1. Validates the 3 domain invariants, throwing a typed error
 *     subclass on each violation:
 *     - BR-TX-1: `amountMinor > 0` → `InvalidAmountError`.
 *     - BR-TX-2: `direction ∈ { INCOME, EXPENSE }` (no TRANSFER in
 *       v1) → `InvalidDirectionError`.
 *     - BR-TX-3: `transactionDate <= input.now` →
 *       `FutureTransactionDateError`.
 *  2. Sets `createdAt = updatedAt = input.now` (the injected clock;
 *     the domain layer never calls `new Date()`).
 *  3. Attaches the `equals` and `withUpdates` instance methods so
 *     the caller can use the ergonomic API on the returned
 *     aggregate without re-importing the helpers from
 *     `transaction.ts`.
 *
 * The factory is pure: no I/O, no clock side-effects, no logging.
 * The action layer (slice 2) calls it after the Zod parse and the
 * FX snapshot computation. Throwing typed errors keeps the
 * action-layer catch uniform (`instanceof TransactionDomainError`).
 */

import {
  type NewTransactionInput,
  type Transaction,
  attachTransactionMethods,
} from '../entities/transaction';
import { TransactionDirection } from '../entities/transaction-direction';
import {
  FutureTransactionDateError,
  InvalidAmountError,
  InvalidDirectionError,
} from '../entities/transaction.errors';

export function createTransaction(input: NewTransactionInput): Transaction {
  // BR-TX-1: amountMinor must be strictly positive. The sign
  // comes from `direction`; a non-positive amount is a caller
  // mistake (the Zod parse in the action layer is the primary
  // gate, the factory is the secondary).
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new InvalidAmountError(
      `amountMinor must be a positive integer; got ${input.amountMinor}`,
    );
  }

  // BR-TX-2: TRANSFER is reserved for v1.1 and rejected at the
  // write boundary. The action layer is the primary gate; the
  // factory is the secondary (defense in depth).
  if (input.direction === TransactionDirection.TRANSFER) {
    throw new InvalidDirectionError(
      'direction === TRANSFER is rejected at the write boundary; reserved for v1.1.',
    );
  }

  // BR-TX-3: transactionDate must not be in the future relative
  // to the injected clock. The factory accepts a `now` value
  // rather than reading `new Date()` so the test is deterministic.
  if (input.transactionDate.getTime() > input.now.getTime()) {
    throw new FutureTransactionDateError(
      `transactionDate (${input.transactionDate.toISOString()}) must not be in the future (now = ${input.now.toISOString()}).`,
    );
  }

  // The 14 readonly value fields. The factory is the one place
  // that builds this literal; the rest of the codebase consumes
  // `Transaction` through the typed interface.
  const valueFields: Omit<Transaction, 'equals' | 'withUpdates'> = {
    id: input.id,
    userId: input.userId,
    accountId: input.accountId,
    direction: input.direction,
    amountMinor: input.amountMinor,
    currency: input.currency,
    memo: input.memo,
    category: input.category,
    transactionDate: input.transactionDate,
    convertedAmountMinor: input.convertedAmountMinor,
    convertedCurrency: input.convertedCurrency,
    fxAsOfSnapshot: input.fxAsOfSnapshot,
    casaSnapshot: input.casaSnapshot,
    createdAt: input.now,
    updatedAt: input.now,
  };

  // Attach the two instance methods (closes over the freshly
  // built value fields) and return the fully-formed aggregate.
  return attachTransactionMethods(valueFields);
}
