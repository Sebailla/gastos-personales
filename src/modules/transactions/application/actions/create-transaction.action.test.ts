/**
 * Tests for createTransactionAction.
 *
 * RED — 8 cases covering:
 * (1) valid input creates and returns the DTO
 * (2) TransactionRecorded event is dispatched after a successful create
 * (3) archived account → ACCOUNT_ARCHIVED (409)
 * (4) invalid amount → INVALID_AMOUNT (400)
 * (5) future date → FUTURE_DATE_NOT_ALLOWED (400)
 * (6) TRANSFER → VALIDATION_ERROR (400)
 * (7) FX provider failure → FX_UNAVAILABLE (503)
 * (8) Zod validation failure → VALIDATION_ERROR (400)
 *
 * Slice 3 binding. The action:
 *   1. parses with `TransactionCreateSchema`;
 *   2. pre-checks the parent account (loaded via
 *      `TransactionRepositoryPort` for the BR-TX-5 archived
 *      check — but in slice 3 the action uses an injected
 *      `accountRepository` because the `TransactionRepositoryPort`
 *      does not have a "find account" method, per the slice
 *      scope rule);
 *   3. calls `createTransaction` (now async per slice 2) with
 *      the FX snapshot helper;
 *   4. dispatches `TransactionRecorded` via the injected
 *      `dispatcher`;
 *   5. returns the DTO.
 *
 * Note on the TRANSFER case: the Zod schema rejects `TRANSFER`
 * at parse time (the enum is `INCOME | EXPENSE`), so the
 * factory's `InvalidDirectionError` branch is not exercised
 * here. The factory path is covered by the slice-2 factory
 * tests (`create-transaction.test.ts`). The slice-3 wire
 * contract for the TRANSFER direction is `VALIDATION_ERROR`,
 * which the action's zod-error mapping produces.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTransactionAction } from './create-transaction.action';
import { InMemoryTransactionRepository } from '../fixtures/in-memory-transaction.repository';
import { assertOk, assertFail } from './_narrow';
import type { TransactionActionDeps } from './_shared';
import { AccountCurrency, AccountFxCasa } from '@/shared/domain-kernel';
import { TransactionDirection } from '../../domain/entities/transaction';
import { logger } from '@/shared/logger/logger';
import { EventDispatcher, TransactionRecorded } from '@/shared/events/event-dispatcher';
import type { FxRateProvider } from '@/shared/domain-kernel';
import type { AccountRepositoryPort } from '@/modules/accounts';
import {
  AccountKind,
  AccountType,
  type FinancialAccount,
  OpeningBalanceMode,
} from '@/modules/accounts';

const ACCOUNT_ID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

function makeAccount(overrides: Partial<FinancialAccount> = {}): FinancialAccount {
  const now = new Date('2026-06-23T10:00:00.000Z');
  return {
    id: ACCOUNT_ID,
    userId: 'u-1',
    type: AccountType.BANK,
    name: 'Main',
    currency: AccountCurrency.USD,
    openingBalanceMinor: 0,
    openingBalanceMode: OpeningBalanceMode.FRESH,
    openingBalanceDate: null,
    archivedAt: null,
    bankName: 'ICBC',
    accountKind: AccountKind.SAVINGS,
    issuer: null,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    broker: null,
    investmentType: null,
    walletAddress: null,
    casa: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDeps(
  opts: {
    account?: FinancialAccount | null;
    fxProvider?: FxRateProvider;
    dispatcher?: EventDispatcher;
  } = {},
): {
  deps: TransactionActionDeps;
  repo: InMemoryTransactionRepository;
  dispatcher: EventDispatcher;
  accountRepository: AccountRepositoryPort;
} {
  const repo = new InMemoryTransactionRepository();
  const fakeFx: FxRateProvider = opts.fxProvider ?? {
    getDisplayAmount: vi.fn(async () => ({
      native: { amount: 1000, currency: AccountCurrency.USD },
      display: {
        amount: 1100000,
        currency: AccountCurrency.ARS,
        fxRate: 1100,
        fxAsOf: new Date('2026-06-23T10:00:00.000Z'),
      },
      stale: false,
    })),
  };
  const localDispatcher = opts.dispatcher ?? new EventDispatcher();
  // The slice-3 design uses only `findById` on the account port.
  // Build a full AccountRepositoryPort with `findById` returning
  // the test-supplied account (or null) and the remaining methods
  // stubbed with `vi.fn()` so the contract is honored at the type
  // level (no `any`, no `as never`).
  const accountRepository = {
    findById: vi.fn(async (userId: string, id: string) => {
      if (opts.account === null) return null;
      return opts.account ?? makeAccount({ id, userId });
    }),
    list: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
  } satisfies AccountRepositoryPort;
  const deps: TransactionActionDeps = {
    repo,
    clock: () => new Date('2026-06-23T10:00:00.000Z'),
    logger,
    dispatcher: localDispatcher,
    fxRateProvider: fakeFx,
    accountRepository,
  };
  return { deps, repo, dispatcher: localDispatcher, accountRepository };
}

describe('createTransactionAction', () => {
  let deps: TransactionActionDeps;
  let dispatcher: EventDispatcher;
  beforeEach(() => {
    ({ deps, dispatcher } = makeDeps());
  });

  it('valid input creates and returns the DTO', async () => {
    const result = await createTransactionAction(deps, 'u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      originalCurrency: AccountCurrency.USD,
      transactionDate: '2026-06-23T10:00:00.000Z',
      memo: 'lunch',
      category: 'food',
    });
    assertOk(result);
    expect(result.value.id).toMatch(/^tx_/);
    expect(result.value.memo).toBe('lunch');
    expect(result.value.amountMinor).toBe(1000);
  });

  it('dispatches TransactionRecorded event after a successful create', async () => {
    const handler = vi.fn();
    dispatcher.subscribe(TransactionRecorded, handler);
    await createTransactionAction(deps, 'u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      originalCurrency: AccountCurrency.USD,
      transactionDate: '2026-06-23T10:00:00.000Z',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns ACCOUNT_ARCHIVED when the parent account is archived', async () => {
    ({ deps } = makeDeps({
      account: makeAccount({ archivedAt: new Date('2026-06-22T00:00:00.000Z') }),
    }));
    const result = await createTransactionAction(deps, 'u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      originalCurrency: AccountCurrency.USD,
      transactionDate: '2026-06-23T10:00:00.000Z',
    });
    assertFail(result);
    expect(result.error.code).toBe('ACCOUNT_ARCHIVED');
  });

  it('returns INVALID_AMOUNT when amountMinor is non-integer', async () => {
    // Zod accepts any positive number (the slice-2 factory
    // rejects non-integer values with `InvalidAmountError`,
    // which the action surfaces as INVALID_AMOUNT).
    const result = await createTransactionAction(deps, 'u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1.5,
      originalCurrency: AccountCurrency.USD,
      transactionDate: '2026-06-23T10:00:00.000Z',
    });
    assertFail(result);
    expect(result.error.code).toBe('INVALID_AMOUNT');
  });

  it('returns FUTURE_DATE_NOT_ALLOWED when transactionDate is in the future', async () => {
    // One day in milliseconds — chosen so the test always falls
    // strictly after `Date.now()` regardless of timezone offset.
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const future = new Date(Date.now() + ONE_DAY_MS).toISOString();
    const result = await createTransactionAction(deps, 'u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      originalCurrency: AccountCurrency.USD,
      transactionDate: future,
    });
    assertFail(result);
    expect(result.error.code).toBe('FUTURE_DATE_NOT_ALLOWED');
  });

  it('returns VALIDATION_ERROR when direction === TRANSFER', async () => {
    const result = await createTransactionAction(deps, 'u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.TRANSFER,
      amountMinor: 1000,
      originalCurrency: AccountCurrency.USD,
      transactionDate: '2026-06-23T10:00:00.000Z',
    });
    assertFail(result);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns FX_UNAVAILABLE when the FX provider throws', async () => {
    ({ deps } = makeDeps({
      account: makeAccount({ casa: AccountFxCasa.OFICIAL }),
      fxProvider: {
        getDisplayAmount: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    }));
    const result = await createTransactionAction(deps, 'u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      originalCurrency: AccountCurrency.USD,
      transactionDate: '2026-06-23T10:00:00.000Z',
    });
    assertFail(result);
    expect(result.error.code).toBe('FX_UNAVAILABLE');
  });

  it('returns VALIDATION_ERROR when Zod parse fails', async () => {
    const result = await createTransactionAction(deps, 'u-1', {
      accountId: 'not-a-uuid',
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      originalCurrency: AccountCurrency.USD,
      transactionDate: '2026-06-23T10:00:00.000Z',
    });
    assertFail(result);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
