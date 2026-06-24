/**
 * Tests for updateTransactionAction.
 *
 * RED — 5 cases covering:
 * (1) valid partial update (memo only) succeeds
 * (2) NOT_FOUND on missing row
 * (3) NOT_FOUND on cross-user
 * (4) FX recomputed when `originalCurrency` changes
 * (5) FX recomputed when `amountMinor` changes
 *
 * Slice 3 binding. The action:
 *   1. parses with `TransactionUpdateSchema`;
 *   2. loads the existing row via the repository (scoped to
 *      userId — cross-user is `null`);
 *   3. if `amountMinor` or `originalCurrency` changed, calls
 *      `convertAndSnapshot` (REQ-TX-12) to recompute the FX
 *      snapshot;
 *   4. persists the patch via the repository;
 *   5. returns the DTO.
 *
 * The native→casa skip path is exercised when native equals
 * the casa's currency; the call path when they differ.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateTransactionAction } from './update-transaction.action';
import { InMemoryTransactionRepository } from '../fixtures/in-memory-transaction.repository';
import { assertOk, assertFail } from './_narrow';
import type { TransactionActionDeps } from './_shared';
import {
  AccountCurrency,
  AccountFxCasa,
  TransactionDirection,
} from '../../domain/entities/transaction';
import { logger } from '@/shared/logger/logger';
import { dispatcher } from '@/shared/events/event-dispatcher';
import type { FxRateProvider } from '../../domain/interfaces/fx-rate-provider.port';

const FX_AS_OF = new Date('2026-06-23T10:00:00.000Z');
const ACCOUNT_ID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

function makeDeps(opts: { fxProvider?: FxRateProvider } = {}): {
  deps: TransactionActionDeps;
  repo: InMemoryTransactionRepository;
} {
  const repo = new InMemoryTransactionRepository();
  const fakeFx: FxRateProvider = opts.fxProvider ?? {
    getDisplayAmount: vi.fn(async () => ({
      native: { amount: 1000, currency: AccountCurrency.USD },
      display: {
        amount: 1100000,
        currency: AccountCurrency.ARS,
        fxRate: 1100,
        fxAsOf: FX_AS_OF,
      },
      stale: false,
    })),
  };
  const deps: TransactionActionDeps = {
    repo,
    clock: () => FX_AS_OF,
    logger,
    dispatcher,
    fxRateProvider: fakeFx,
  };
  return { deps, repo };
}

describe('updateTransactionAction', () => {
  let deps: TransactionActionDeps;
  let repo: InMemoryTransactionRepository;
  beforeEach(() => {
    ({ deps, repo } = makeDeps());
  });

  it('valid partial update (memo only) succeeds and preserves the FX snapshot', async () => {
    const created = await repo.create('u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.USD,
      memo: 'old memo',
      category: null,
      transactionDate: new Date('2026-06-22T10:00:00.000Z'),
      convertedAmountMinor: 1100000,
      convertedCurrency: AccountCurrency.ARS,
      fxAsOfSnapshot: FX_AS_OF,
      casaSnapshot: AccountFxCasa.OFICIAL,
    });
    const result = await updateTransactionAction(deps, 'u-1', {
      id: created.id,
      memo: 'new memo',
    });
    assertOk(result);
    expect(result.value.memo).toBe('new memo');
    expect(result.value.convertedAmountMinor).toBe(1100000);
    expect(result.value.fxAsOfSnapshot).toBe(FX_AS_OF.toISOString());
  });

  it('returns NOT_FOUND when the row is missing', async () => {
    const result = await updateTransactionAction(deps, 'u-1', {
      id: 'tx-does-not-exist',
      memo: 'x',
    });
    assertFail(result);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND on cross-user access', async () => {
    const created = await repo.create('u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-22T10:00:00.000Z'),
      convertedAmountMinor: 1100000,
      convertedCurrency: AccountCurrency.ARS,
      fxAsOfSnapshot: FX_AS_OF,
      casaSnapshot: AccountFxCasa.OFICIAL,
    });
    const result = await updateTransactionAction(deps, 'u-2', {
      id: created.id,
      memo: 'hacked',
    });
    assertFail(result);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('recomputes FX when originalCurrency changes', async () => {
    const fxProvider: FxRateProvider = {
      getDisplayAmount: vi.fn(async () => ({
        native: { amount: 1000, currency: AccountCurrency.USD },
        display: {
          amount: 1200000,
          currency: AccountCurrency.ARS,
          fxRate: 1200,
          fxAsOf: FX_AS_OF,
        },
        stale: false,
      })),
    };
    ({ deps, repo } = makeDeps({ fxProvider }));
    const created = await repo.create('u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.ARS,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-22T10:00:00.000Z'),
      convertedAmountMinor: 1100000,
      convertedCurrency: AccountCurrency.ARS,
      fxAsOfSnapshot: FX_AS_OF,
      casaSnapshot: AccountFxCasa.OFICIAL,
    });
    const result = await updateTransactionAction(deps, 'u-1', {
      id: created.id,
      originalCurrency: AccountCurrency.USD,
    });
    assertOk(result);
    expect(fxProvider.getDisplayAmount).toHaveBeenCalledTimes(1);
    expect(result.value.currency).toBe(AccountCurrency.USD);
    expect(result.value.convertedAmountMinor).toBe(1200000);
  });

  it('recomputes FX when amountMinor changes', async () => {
    const fxProvider: FxRateProvider = {
      getDisplayAmount: vi.fn(async () => ({
        native: { amount: 2000, currency: AccountCurrency.USD },
        display: {
          amount: 2200000,
          currency: AccountCurrency.ARS,
          fxRate: 1100,
          fxAsOf: FX_AS_OF,
        },
        stale: false,
      })),
    };
    ({ deps, repo } = makeDeps({ fxProvider }));
    const created = await repo.create('u-1', {
      accountId: ACCOUNT_ID,
      direction: TransactionDirection.EXPENSE,
      amountMinor: 1000,
      currency: AccountCurrency.USD,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-22T10:00:00.000Z'),
      convertedAmountMinor: 1100000,
      convertedCurrency: AccountCurrency.ARS,
      fxAsOfSnapshot: FX_AS_OF,
      casaSnapshot: AccountFxCasa.OFICIAL,
    });
    const result = await updateTransactionAction(deps, 'u-1', {
      id: created.id,
      amountMinor: 2000,
    });
    assertOk(result);
    expect(fxProvider.getDisplayAmount).toHaveBeenCalledTimes(1);
    expect(result.value.amountMinor).toBe(2000);
    expect(result.value.convertedAmountMinor).toBe(2200000);
  });
});
