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
 * Test data: the test file owns a small in-memory list
 * function that returns kernel `TransactionDTO` rows. The
 * reports module stays decoupled from the transactions
 * module at the test seam (root AGENTS.md §10.5 "Modules
 * isolated"). The action's `deps.reportsRepository` is
 * wired to `InMemoryReportsRepository(listFn)` where
 * `listFn` is the kernel-port-shaped list callback below.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getMonthlySummaryAction } from './get-monthly-summary.action';
import { InMemoryReportsRepository } from '../fixtures/reports-repository.inmemory';
import { AccountCurrency } from '@/shared/domain-kernel';
import type {
  ListTransactionsOptions,
  ListTransactionsPage,
  TransactionDTO,
} from '@/shared/domain-kernel';
import { logger } from '@/shared/logger/logger';
import { dispatcher } from '@/shared/events/event-dispatcher';
import { systemClock } from '@/shared/clock/system-clock';
import type { ReportsActionDeps } from './_shared';

/**
 * Build a kernel `TransactionDTO` row for test seeding. Uses
 * the structural 9-field subset only — no canonical `Transaction`
 * import (root AGENTS.md §10.5 "Modules isolated").
 */
function makeRow(
  userId: string,
  accountId: string,
  direction: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  amountMinor: number,
  currency: AccountCurrency,
  day: number,
): TransactionDTO {
  const date = new Date(Date.UTC(2026, 5, day, 12, 0, 0, 0));
  return {
    id: `tx_${userId}_${accountId}_${direction}_${day}`,
    userId,
    accountId,
    direction,
    category: null,
    memo: null,
    transactionDate: date,
    convertedAmountMinor: direction === 'EXPENSE' ? -amountMinor : amountMinor,
    convertedCurrency: currency,
  };
}

/**
 * Test-owned in-memory list function matching the kernel
 * `TransactionRepositoryPort.list` signature. Filters rows
 * by `userId` (cross-module invariant) and `accountId` when
 * supplied.
 */
function makeListFn(rows: readonly TransactionDTO[]) {
  return async (
    userId: string,
    opts: ListTransactionsOptions,
  ): Promise<ListTransactionsPage> => {
    const matching = rows
      .filter((r) => r.userId === userId)
      .filter((r) => opts.accountId === undefined || r.accountId === opts.accountId);
    return { data: matching, nextCursor: null };
  };
}

function makeDeps(rows: readonly TransactionDTO[]): { deps: ReportsActionDeps } {
  const reportsRepo = new InMemoryReportsRepository(makeListFn(rows));
  const deps: ReportsActionDeps = {
    reportsRepository: reportsRepo,
    accountRepository: { findById: async () => null },
    subscriber: { onTransactionRecorded: () => () => undefined },
    clock: systemClock,
    logger,
    dispatcher,
  };
  return { deps };
}

describe('getMonthlySummaryAction', () => {
  let deps: ReportsActionDeps;

  beforeEach(() => {
    ({ deps } = makeDeps([]));
  });

  it('returns 200 with MonthlySummaryDTO for a valid month', async () => {
    const rows = [
      makeRow('u1', 'a1', 'INCOME', 100000, AccountCurrency.ARS, 5),
      makeRow('u1', 'a1', 'EXPENSE', 50000, AccountCurrency.ARS, 10),
    ];
    ({ deps } = makeDeps(rows));
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        totals: [
          {
            convertedCurrency: 'ARS',
            incomeMinor: 100000,
            expenseMinor: 50000,
            netMinor: 50000,
            count: 2,
          },
        ],
        generatedAt: expect.any(String),
      },
    });
  });

  it('returns 200 { totals: [] } for a user with no rows', async () => {
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        totals: [],
        generatedAt: expect.any(String),
      },
    });
  });

  it('returns 400 VALIDATION_ERROR on a bad month', async () => {
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: 'foo' },
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
      }),
    });
  });

  it('does not include cross-user rows in the response', async () => {
    const rows = [
      makeRow('u1', 'a1', 'INCOME', 100000, AccountCurrency.ARS, 5),
      makeRow('u2', 'a1', 'INCOME', 999999, AccountCurrency.ARS, 10),
    ];
    ({ deps } = makeDeps(rows));
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        totals: [
          {
            convertedCurrency: 'ARS',
            incomeMinor: 100000,
            count: 1,
          },
        ],
      },
    });
  });
});
