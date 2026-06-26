/**
 * Tests for `getCategoryBreakdownAction` (T-RPT-110).
 *
 * Slice 2 deliverable — action-layer tests for
 * `GET /api/reports/breakdown`. The action shape mirrors
 * `getMonthlySummaryAction` but groups by
 * `(categoryNormalized, convertedCurrency)` per REQ-RPT-2.
 *
 * Tests (T-RPT-110 acceptance criteria from design §5.4):
 *   (1) returns 200 + DTO for valid month.
 *   (2) returns 200 `{ buckets: [] }` for empty user.
 *   (3) returns 400 VALIDATION_ERROR on bad month.
 *   (4) cross-user rows do not appear.
 *
 * Test data: the test file owns a small in-memory list
 * function that returns kernel `TransactionDTO` rows. The
 * reports module stays decoupled from the transactions
 * module at the test seam (root AGENTS.md §10.5 "Modules
 * isolated").
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getCategoryBreakdownAction } from './get-category-breakdown.action';
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

function makeRow(
  userId: string,
  accountId: string,
  direction: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  amountMinor: number,
  currency: AccountCurrency,
  day: number,
  category: string | null,
): TransactionDTO {
  const date = new Date(Date.UTC(2026, 5, day, 12, 0, 0, 0));
  return {
    id: `tx_${userId}_${accountId}_${direction}_${day}_${category ?? 'null'}`,
    userId,
    accountId,
    direction,
    category,
    memo: null,
    transactionDate: date,
    convertedAmountMinor: direction === 'EXPENSE' ? -amountMinor : amountMinor,
    convertedCurrency: currency,
  };
}

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

describe('getCategoryBreakdownAction', () => {
  let deps: ReportsActionDeps;

  beforeEach(() => {
    ({ deps } = makeDeps([]));
  });

  it('returns 200 with CategoryBreakdownDTO for a valid month', async () => {
    const rows = [
      makeRow('u1', 'a1', 'EXPENSE', 30000, AccountCurrency.ARS, 5, 'Food'),
      makeRow('u1', 'a1', 'EXPENSE', 20000, AccountCurrency.ARS, 10, 'food'),
      makeRow('u1', 'a1', 'EXPENSE', 10000, AccountCurrency.ARS, 15, null),
    ];
    ({ deps } = makeDeps(rows));
    const result = await getCategoryBreakdownAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    // Per design §12.9 sign convention, expense rows carry
    // negative convertedAmountMinor. 'food' bucket sums to
    // -50000; 'uncategorized' to -10000. DESC sort puts the
    // less-negative bucket first.
    expect(result).toMatchObject({
      ok: true,
      value: {
        buckets: [
          { categoryNormalized: 'uncategorized', txCount: 1 },
          { categoryNormalized: 'food', txCount: 2 },
        ],
        generatedAt: expect.any(String),
      },
    });
  });

  it('returns 200 { buckets: [] } for an empty user', async () => {
    const result = await getCategoryBreakdownAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { buckets: [], generatedAt: expect.any(String) },
    });
  });

  it('returns 400 VALIDATION_ERROR on a bad month', async () => {
    const result = await getCategoryBreakdownAction(deps, {
      userId: 'u1',
      rawQuery: { month: 'foo' },
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
  });

  it('does not include cross-user rows in the response', async () => {
    const rows = [
      makeRow('u1', 'a1', 'EXPENSE', 10000, AccountCurrency.ARS, 5, 'Food'),
      makeRow('u2', 'a1', 'EXPENSE', 999999, AccountCurrency.ARS, 10, 'Food'),
    ];
    ({ deps } = makeDeps(rows));
    const result = await getCategoryBreakdownAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        buckets: [{ categoryNormalized: 'food', txCount: 1 }],
      },
    });
  });
});
