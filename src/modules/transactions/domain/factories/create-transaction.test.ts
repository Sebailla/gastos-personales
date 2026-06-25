import { describe, it, expect, vi } from 'vitest';
import { EventDispatcher, TransactionRecorded } from '@/shared/events/event-dispatcher';
import { AccountCurrency, AccountFxCasa } from '@/shared/domain-kernel';
import {
  TransactionDirection,
  type NewTransactionInput,
} from '../entities/transaction';
import { createTransaction } from '../factories/create-transaction';
import {
  InvalidAmountError,
  InvalidDirectionError,
  FutureTransactionDateError,
} from '../entities/transaction.errors';
import type { FxRateProvider } from '@/shared/domain-kernel';

// `FxRateProvider` is the shared-kernel port imported from
// `@/shared/domain-kernel`. The canonical port lives at
// `@/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
// (the source of truth that `AccountService` depends on); the
// kernel port here is the structural minimum that the
// transactions `convertAndSnapshot` helper consumes. Drift
// between the two is detected at the type level: a
// `PrismaFxRateProvider` satisfies the canonical port and is
// structurally compatible with this kernel port.

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

  it('happy path: returns a Transaction with all 14 fields populated', async () => {
    const tx = await createTransaction(validInput);
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

  it('sets createdAt = updatedAt = input.now', async () => {
    const tx = await createTransaction(validInput);
    expect(tx.createdAt).toEqual(now);
    expect(tx.updatedAt).toEqual(now);
  });

  it('attaches equals and withUpdates methods on the returned aggregate', async () => {
    const tx = await createTransaction(validInput);
    expect(typeof tx.equals).toBe('function');
    expect(typeof tx.withUpdates).toBe('function');
    // equals returns true for the same input built twice.
    const same = await createTransaction(validInput);
    expect(tx.equals(same)).toBe(true);
  });

  it('BR-TX-1: rejects amountMinor <= 0 with InvalidAmountError', async () => {
    await expect(createTransaction({ ...validInput, amountMinor: 0 })).rejects.toThrow(
      InvalidAmountError,
    );
    await expect(createTransaction({ ...validInput, amountMinor: -100 })).rejects.toThrow(
      InvalidAmountError,
    );
  });

  it('BR-TX-2: rejects direction === TRANSFER with InvalidDirectionError', async () => {
    await expect(
      createTransaction({ ...validInput, direction: TransactionDirection.TRANSFER }),
    ).rejects.toThrow(InvalidDirectionError);
  });

  it('BR-TX-3: rejects future transactionDate with FutureTransactionDateError', async () => {
    await expect(createTransaction({ ...validInput, transactionDate: later })).rejects.toThrow(
      FutureTransactionDateError,
    );
  });
});

/**
 * RED: createTransaction factory — slice 2 expansion (4 new cases).
 *
 * Slice 2 binding. The factory signature gains two optional
 * arguments: a `CreateTransactionDeps` bag (with the event
 * dispatcher) and a `FxRateProvider`. When the deps are supplied,
 * the factory:
 *  - recomputes the FX snapshot via `convertAndSnapshot` (BR-TX-6
 *    + REQ-TX-12);
 *  - dispatches a `TransactionRecorded` event (REQ-TX-13,
 *    BR-TX-11).
 *
 * When deps are NOT supplied (slice-1 callers), the factory
 * honors the snapshot fields already on `input` and skips the
 * dispatch. The slice-1 tests above exercise the no-deps path.
 *
 * Branches:
 *  1. native=casa skips the FX call; the row carries the input
 *     snapshot verbatim; no event is dispatched (deps missing).
 *  2. native≠casa calls `FxRateProvider.getDisplayAmount`; the
 *     row carries the provider's snapshot; the input snapshot
 *     is overwritten.
 *  3. When a dispatcher is supplied, the factory publishes a
 *     `TransactionRecorded` event with the create payload.
 *  4. The factory accepts a custom casa from the input
 *     (caller-resolved per BR-FX-3, not the env default).
 */
describe('createTransaction factory — slice 2 fx-snapshot + event wiring', () => {
  const now = new Date('2026-06-22T12:00:00.000Z');
  const earlier = new Date('2026-06-22T10:00:00.000Z');

  const fxAsOf = new Date('2026-06-22T11:00:00.000Z');

  function fakeFx(displayAmount: number, fxAsOfValue: Date): FxRateProvider {
    return {
      getDisplayAmount: vi.fn(async () => ({
        native: { amount: 1000, currency: AccountCurrency.USD },
        display: {
          amount: displayAmount,
          currency: AccountCurrency.ARS,
          fxRate: 1100,
          fxAsOf: fxAsOfValue,
        },
        stale: false,
      })),
    };
  }

  it('stamps convertedAmountMinor when native currency equals casa currency (skip path)', async () => {
    // ARS native + ARS casa → no FX call; the factory must mirror
    // the input snapshot exactly and skip the FX provider.
    const fx = fakeFx(99999, fxAsOf);
    const tx = await createTransaction(
      {
        id: 'tx-skip',
        userId: 'u-1',
        accountId: 'fa-1',
        direction: TransactionDirection.EXPENSE,
        amountMinor: 5000,
        currency: AccountCurrency.ARS,
        memo: null,
        category: null,
        transactionDate: earlier,
        convertedAmountMinor: 5000,
        convertedCurrency: AccountCurrency.ARS,
        fxAsOfSnapshot: null,
        casaSnapshot: null,
        now,
      },
      undefined,
      fx,
    );
    expect(fx.getDisplayAmount).not.toHaveBeenCalled();
    expect(tx.convertedAmountMinor).toBe(5000);
    expect(tx.convertedCurrency).toBe(AccountCurrency.ARS);
    expect(tx.fxAsOfSnapshot).toBeNull();
    expect(tx.casaSnapshot).toBeNull();
  });

  it('calls FxRateProvider.getDisplayAmount when native currency differs from casa currency', async () => {
    // USD native + ARS casa → call path; the factory must
    // overwrite the input snapshot with the provider's result.
    const fx = fakeFx(1100000, fxAsOf);
    const tx = await createTransaction(
      {
        id: 'tx-call',
        userId: 'u-1',
        accountId: 'fa-1',
        direction: TransactionDirection.EXPENSE,
        amountMinor: 1000,
        currency: AccountCurrency.USD,
        memo: null,
        category: null,
        transactionDate: earlier,
        // The input snapshot values are stale by design; the
        // factory must overwrite them with the provider's result.
        convertedAmountMinor: 1,
        convertedCurrency: AccountCurrency.USD,
        fxAsOfSnapshot: earlier,
        casaSnapshot: AccountFxCasa.OFICIAL,
        now,
      },
      undefined,
      fx,
    );
    expect(fx.getDisplayAmount).toHaveBeenCalledTimes(1);
    expect(tx.convertedAmountMinor).toBe(1100000);
    expect(tx.convertedCurrency).toBe(AccountCurrency.ARS);
    expect(tx.fxAsOfSnapshot).toEqual(fxAsOf);
    expect(tx.casaSnapshot).toBe(AccountFxCasa.OFICIAL);
  });

  it('dispatches a TransactionRecorded event after a successful create', async () => {
    const dispatcher = new EventDispatcher();
    const handler = vi.fn();
    dispatcher.subscribe(TransactionRecorded, handler);

    const fx = fakeFx(1100000, fxAsOf);
    const tx = await createTransaction(
      {
        id: 'tx-evt',
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
        fxAsOfSnapshot: fxAsOf,
        casaSnapshot: AccountFxCasa.OFICIAL,
        now,
      },
      { dispatcher },
      fx,
    );

    // The handler received the event with the documented payload.
    expect(handler).toHaveBeenCalledTimes(1);
    // Assert the event shape flatly without a runtime type-guard
    // branch (AGENTS.md §10.5 "No logic in tests | Clean tests,
    // without `if`/`else`/`for`"). toMatchObject is the
    // type-safe shape assertion.
    expect(handler).toHaveBeenCalledWith({
      type: TransactionRecorded,
      payload: {
        userId: 'u-1',
        transactionId: tx.id,
        accountId: 'fa-1',
        direction: 'EXPENSE',
        amountMinor: 1000,
        currency: 'USD',
        casa: AccountFxCasa.OFICIAL,
        convertedAmountMinor: 1100000,
        convertedCurrency: 'ARS',
        occurredAt: now.toISOString(),
      },
    });
  });

  it('accepts a custom casa from the input (BR-FX-3 caller-resolves)', async () => {
    // The factory must honor the casa the caller resolved
    // (account.casa ?? env.FX_DEFAULT_CASA). The factory MUST
    // NOT consult env directly. We pass BLUE instead of the
    // default and verify the FX call uses the lowercase 'blue'
    // casa, not 'oficial'.
    const fx = fakeFx(1200000, fxAsOf);
    await createTransaction(
      {
        id: 'tx-blue',
        userId: 'u-1',
        accountId: 'fa-1',
        direction: TransactionDirection.EXPENSE,
        amountMinor: 1000,
        currency: AccountCurrency.USD,
        memo: null,
        category: null,
        transactionDate: earlier,
        convertedAmountMinor: 1,
        convertedCurrency: AccountCurrency.USD,
        fxAsOfSnapshot: earlier,
        casaSnapshot: AccountFxCasa.BLUE,
        now,
      },
      undefined,
      fx,
    );
    const call = (fx.getDisplayAmount as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.casa).toBe('blue');
  });
});
