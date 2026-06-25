/**
 * Domain factory: `createTransaction`.
 *
 * The SINGLE place that constructs a new `Transaction` aggregate
 * (slice 1 lock + slice 2 expansion). The factory:
 *
 *  1. Validates the 3 domain invariants, throwing a typed error
 *     subclass on each violation:
 *     - BR-TX-1: `amountMinor > 0` → `InvalidAmountError`.
 *     - BR-TX-2: `direction ∈ { INCOME, EXPENSE }` (no TRANSFER in
 *       v1) → `InvalidDirectionError`.
 *     - BR-TX-3: `transactionDate <= input.now` →
 *       `FutureTransactionDateError`.
 *  2. Computes the FX snapshot via `convertAndSnapshot` when an
 *     `FxRateProvider` is supplied (slice 2). When the provider
 *     is omitted, the snapshot fields on `input` are honored
 *     verbatim (slice 1 path). Skip path (BR-TX-6): native=casa
 *     → no FX call.
 *  3. Dispatches a `TransactionRecorded` event when a
 *     `CreateTransactionDeps` bag with an `EventDispatcher` is
 *     supplied (REQ-TX-13, BR-TX-11). When omitted, no event
 *     fires (slice 1 path).
 *  4. Sets `createdAt = updatedAt = input.now` (the injected clock;
 *     the domain layer never calls `new Date()`).
 *  5. Attaches the `equals` and `withUpdates` instance methods so
 *     the caller can use the ergonomic API on the returned
 *     aggregate without re-importing the helpers from
 *     `transaction.ts`.
 *
 * The factory is pure modulo the FX call and the event dispatch:
 * no I/O, no clock side-effects, no logging. The action layer
 * (slice 2) calls it after the Zod parse and the
 * `account.archivedAt` pre-check. Throwing typed errors keeps the
 * action-layer catch uniform (`instanceof TransactionDomainError`).
 */

import { type EventDispatcher, TransactionRecorded } from '@/shared/events/event-dispatcher';
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
import type { FxRateProvider } from '@/shared/domain-kernel';
import { convertAndSnapshot } from '../services/fx-snapshot';

/**
 * Optional deps bag passed by the action layer (slice 2). When
 * supplied, the factory wires the FX snapshot recomputation and
 * the `TransactionRecorded` event dispatch. When omitted, the
 * slice-1 path runs unchanged — the snapshot fields on `input`
 * are honored and no event fires. This dual-mode signature is
 * the slice-2 deviation documented in
 * `openspec/changes/transactions/apply-progress.md` §"Slice 2
 * deviations (planned)".
 */
export interface CreateTransactionDeps {
  readonly dispatcher: EventDispatcher;
}

export async function createTransaction(
  input: NewTransactionInput,
  deps?: CreateTransactionDeps,
  fxRateProvider?: FxRateProvider,
): Promise<Transaction> {
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

  // Slice 2 — FX snapshot recomputation. When the provider is
  // supplied, the factory issues the FX call (skip path when
  // native = casa currency) and overwrites the snapshot fields
  // on the input with the provider's result. When the provider
  // is omitted, the slice-1 input snapshot is honored.
  let snapshot = {
    convertedAmountMinor: input.convertedAmountMinor,
    convertedCurrency: input.convertedCurrency,
    fxAsOfSnapshot: input.fxAsOfSnapshot,
    casaSnapshot: input.casaSnapshot,
  };
  if (fxRateProvider !== undefined) {
    // BR-FX-3: casa resolution is the caller's responsibility.
    // The factory uses the casa the caller resolved (input.casaSnapshot
    // || env.FX_DEFAULT_CASA upstream); the helper does NOT
    // consult env directly.
    //
    // The slice-2 contract: when the FX provider is supplied, the
    // caller MUST have stamped a casaSnapshot on the input. If the
    // caller forgot, we treat the input as the no-FX-call path
    // (skip) — the factory refuses to invent a default.
    if (input.casaSnapshot !== null) {
      const fx = await convertAndSnapshot({
        originalAmountMinor: input.amountMinor,
        originalCurrency: input.currency,
        casa: input.casaSnapshot,
        fxRateProvider,
        now: input.now,
      });
      snapshot = {
        convertedAmountMinor: fx.convertedAmountMinor,
        convertedCurrency: fx.convertedCurrency,
        fxAsOfSnapshot: fx.fxAsOfSnapshot,
        casaSnapshot: fx.casa,
      };
    }
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
    convertedAmountMinor: snapshot.convertedAmountMinor,
    convertedCurrency: snapshot.convertedCurrency,
    fxAsOfSnapshot: snapshot.fxAsOfSnapshot,
    casaSnapshot: snapshot.casaSnapshot,
    createdAt: input.now,
    updatedAt: input.now,
  };

  // Attach the two instance methods (closes over the freshly
  // built value fields) and return the fully-formed aggregate.
  const tx = attachTransactionMethods(valueFields);

  // Slice 2 — `TransactionRecorded` dispatch. Fires only when
  // the deps bag is supplied. The wire payload mirrors the
  // documented `TransactionRecordedPayload` shape (REQ-TX-13).
  if (deps?.dispatcher !== undefined) {
    await deps.dispatcher.dispatch({
      type: TransactionRecorded,
      payload: {
        userId: input.userId,
        transactionId: input.id,
        accountId: input.accountId,
        direction: input.direction as 'INCOME' | 'EXPENSE',
        amountMinor: input.amountMinor,
        currency: input.currency,
        casa: tx.casaSnapshot,
        convertedAmountMinor: tx.convertedAmountMinor,
        convertedCurrency: tx.convertedCurrency,
        occurredAt: input.now.toISOString(),
      },
    });
  }

  return tx;
}
