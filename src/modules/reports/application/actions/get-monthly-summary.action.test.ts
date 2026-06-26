/**
 * Tests for `getMonthlySummaryAction` (T-RPT-108).
 *
 * Slice 2 deliverable — action-layer tests for
 * `GET /api/reports/monthly`. The action follows the
 * §5.3 flow: Zod parse → port call → factory → DTO mapper →
 * `ActionResult`.
 *
 * Tests (T-RPT-108 acceptance criteria from design §11.2 +
 * spec REQ-RPT-1 + REQ-RPT-5):
 *   (1) returns 200 + `MonthlySummaryDTO` on valid month.
 *   (2) returns 200 `{ totals: [] }` for a user with no rows.
 *   (3) returns 400 `VALIDATION_ERROR` on bad month.
 *   (4) cross-user rows do NOT appear in the response
 *       (BR-TX-4 trust-the-port contract).
 *
 * The fixture (`InMemoryReportsRepository`) is wired in this
 * test file via `txRepo.list.bind(txRepo)` — the
 * modules-isolated rule is preserved (the fixture takes the
 * list callback by injection; the test owns the wiring).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getMonthlySummaryAction } from './get-monthly-summary.action';
import { InMemoryReportsRepository } from '../fixtures/reports-repository.inmemory';
import { InMemoryTransactionRepository } from '@/modules/transactions/application/fixtures/in-memory-transaction.repository';
import { TransactionDirection } from '@/modules/transactions/domain/entities/transaction';
import { AccountCurrency } from '@/shared/domain-kernel';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logger/logger';
import { dispatcher } from '@/shared/events/event-dispatcher';
import { systemClock } from '@/shared/clock/system-clock';
import type { Transaction } from '@/modules/transactions/domain/entities/transaction';
import type { ReportsActionDeps } from './_shared';

function makeRow(
  userId: string,
  accountId: string,
  direction: TransactionDirection,
  amountMinor: number,
  currency: AccountCurrency,
  day: number,
): Transaction {
  const date = new Date(Date.UTC(2026, 5, day, 12, 0, 0, 0));
  return {
    id: `tx_${userId}_${accountId}_${direction}_${day}`,
    userId,
    accountId,
    direction,
    amountMinor,
    currency,
    memo: null,
    category: null,
    transactionDate: date,
    convertedAmountMinor: direction === TransactionDirection.EXPENSE ? -amountMinor : amountMinor,
    convertedCurrency: currency,
    fxAsOfSnapshot: null,
    casaSnapshot: null,
    createdAt: date,
    updatedAt: date,
  } as unknown as Transaction;
}

function makeDeps(txRepo: InMemoryTransactionRepository): {
  deps: ReportsActionDeps;
} {
  const reportsRepo = new InMemoryReportsRepository(txRepo.list.bind(txRepo));
  const deps: ReportsActionDeps = {
    reportsRepository: reportsRepo,
    accountRepository: {
      findById: async () => null,
    },
    subscriber: { onTransactionRecorded: () => () => undefined },
    clock: systemClock,
    logger,
    dispatcher,
  };
  return { deps };
}

describe('getMonthlySummaryAction', () => {
  let txRepo: InMemoryTransactionRepository;
  let deps: ReportsActionDeps;

  beforeEach(() => {
    txRepo = new InMemoryTransactionRepository();
    ({ deps } = makeDeps(txRepo));
  });

  it('returns 200 with MonthlySummaryDTO for a valid month', async () => {
    txRepo.__testInsertRaw(
      makeRow('u1', 'a1', TransactionDirection.INCOME, 100000, AccountCurrency.ARS, 5),
    );
    txRepo.__testInsertRaw(
      makeRow('u1', 'a1', TransactionDirection.EXPENSE, 50000, AccountCurrency.ARS, 10),
    );
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totals).toHaveLength(1);
    expect(result.value.totals[0]).toMatchObject({
      convertedCurrency: 'ARS',
      incomeMinor: 100000,
      expenseMinor: 50000,
      netMinor: 50000,
      count: 2,
    });
    expect(typeof result.value.generatedAt).toBe('string');
  });

  it('returns 200 { totals: [] } for a user with no rows', async () => {
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totals).toEqual([]);
    expect(typeof result.value.generatedAt).toBe('string');
  });

  it('returns 400 VALIDATION_ERROR on a bad month', async () => {
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: 'foo' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(AppError);
    expect((result.error as AppError).code).toBe('VALIDATION_ERROR');
  });

  it('does not include cross-user rows in the response', async () => {
    txRepo.__testInsertRaw(
      makeRow('u1', 'a1', TransactionDirection.INCOME, 100000, AccountCurrency.ARS, 5),
    );
    txRepo.__testInsertRaw(
      makeRow('u2', 'a1', TransactionDirection.INCOME, 999999, AccountCurrency.ARS, 10),
    );
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totals).toHaveLength(1);
    expect(result.value.totals[0]?.incomeMinor).toBe(100000);
  });
});
