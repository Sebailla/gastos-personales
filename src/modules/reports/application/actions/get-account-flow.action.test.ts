/**
 * Tests for `getAccountFlowAction` (T-RPT-110).
 *
 * Slice 2 deliverable — action-layer tests for
 * `GET /api/reports/accounts/:accountId/flow`. The flow
 * action is the most complex of the three: it cross-checks
 * account ownership via `AccountRepositoryPort.findById`
 * (REQ-RPT-4 cross-user guard) and enforces the 366-day
 * upper bound (BR-RPT-3) at the action layer (Zod has no
 * date-math primitive per design §5.6).
 *
 * Tests (T-RPT-110 acceptance criteria):
 *   (1) cross-user 404 (`AccountRepositoryPort.findById`
 *       returns null).
 *   (2) sparse days omitted in the DTO.
 *   (3) range > 366 days → 400 VALIDATION_ERROR.
 *   (4) valid month → 200 + DTO.
 *   (5) valid range → 200 + DTO.
 *
 * Test data: the test file owns a small in-memory list
 * function that returns kernel `TransactionDTO` rows plus
 * an account-by-id map. The reports module stays decoupled
 * from the transactions module at the test seam
 * (root AGENTS.md §10.5 "Modules isolated").
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getAccountFlowAction } from './get-account-flow.action';
import { InMemoryReportsRepository } from '../fixtures/reports-repository.inmemory';
import { AccountCurrency } from '@/shared/domain-kernel';
import type {
  FinancialAccountFields,
  ListTransactionsOptions,
  ListTransactionsPage,
  TransactionDTO,
} from '@/shared/domain-kernel';
import { logger } from '@/shared/logger/logger';
import { dispatcher } from '@/shared/events/event-dispatcher';
import { systemClock } from '@/shared/clock/system-clock';
import type { ReportsActionDeps } from './_shared';

const VALID_CUID = 'c1234567890abcdef1234567z';
const VALID_CUID_2 = 'c2345678901bcdef2345678a';

function makeRow(
  userId: string,
  accountId: string,
  direction: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  amountMinor: number,
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
    convertedCurrency: AccountCurrency.ARS,
  };
}

function makeAccount(overrides: Partial<FinancialAccountFields> = {}): FinancialAccountFields {
  return {
    id: VALID_CUID,
    userId: 'u1',
    currency: AccountCurrency.ARS,
    archivedAt: null,
    casa: null,
    ...overrides,
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

function makeDeps(
  rows: readonly TransactionDTO[],
  accountById: (userId: string, id: string) => Promise<FinancialAccountFields | null>,
): { deps: ReportsActionDeps } {
  const reportsRepo = new InMemoryReportsRepository(makeListFn(rows));
  const deps: ReportsActionDeps = {
    reportsRepository: reportsRepo,
    accountRepository: { findById: accountById },
    subscriber: { onTransactionRecorded: () => () => undefined },
    clock: systemClock,
    logger,
    dispatcher,
  };
  return { deps };
}

const OWNED_ACCOUNT_LOOKUP = async (userId: string, id: string) =>
  userId === 'u1' && id === VALID_CUID ? makeAccount({ id }) : null;

describe('getAccountFlowAction', () => {
  let deps: ReportsActionDeps;

  beforeEach(() => {
    ({ deps } = makeDeps([], OWNED_ACCOUNT_LOOKUP));
  });

  it('returns 200 + AccountFlowDTO for a valid month query', async () => {
    const rows = [
      makeRow('u1', VALID_CUID, 'INCOME', 1000, 1),
      makeRow('u1', VALID_CUID, 'EXPENSE', 500, 3),
    ];
    ({ deps } = makeDeps(rows, OWNED_ACCOUNT_LOOKUP));
    const result = await getAccountFlowAction(deps, {
      userId: 'u1',
      accountId: VALID_CUID,
      rawQuery: { accountId: VALID_CUID, month: '2026-06' },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        days: [
          { date: '2026-06-01', netMinor: 1000, runningBalanceMinor: 1000 },
          { date: '2026-06-03', netMinor: -500, runningBalanceMinor: 500 },
        ],
        generatedAt: expect.any(String),
      },
    });
  });

  it('returns 200 + AccountFlowDTO for a valid date range query', async () => {
    const rows = [makeRow('u1', VALID_CUID, 'INCOME', 1000, 5)];
    ({ deps } = makeDeps(rows, OWNED_ACCOUNT_LOOKUP));
    const result = await getAccountFlowAction(deps, {
      userId: 'u1',
      accountId: VALID_CUID,
      rawQuery: {
        accountId: VALID_CUID,
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { days: [{ date: '2026-06-05' }] },
    });
  });

  it('omits sparse days (no entry on 2026-06-02 between 01 and 03)', async () => {
    const rows = [
      makeRow('u1', VALID_CUID, 'INCOME', 1000, 1),
      makeRow('u1', VALID_CUID, 'EXPENSE', 500, 3),
    ];
    ({ deps } = makeDeps(rows, OWNED_ACCOUNT_LOOKUP));
    const result = await getAccountFlowAction(deps, {
      userId: 'u1',
      accountId: VALID_CUID,
      rawQuery: {
        accountId: VALID_CUID,
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        days: [{ date: '2026-06-01' }, { date: '2026-06-03' }],
      },
    });
  });

  it('returns 404 NOT_FOUND for a cross-user accountId', async () => {
    // u1 calling with an accountId that does not belong to u1.
    const rows = [makeRow('u1', VALID_CUID_2, 'INCOME', 1000, 5)];
    ({ deps } = makeDeps(rows, OWNED_ACCOUNT_LOOKUP));
    const result = await getAccountFlowAction(deps, {
      userId: 'u1',
      accountId: VALID_CUID_2,
      rawQuery: {
        accountId: VALID_CUID_2,
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
  });

  it('returns 400 VALIDATION_ERROR when the range exceeds 366 days', async () => {
    const result = await getAccountFlowAction(deps, {
      userId: 'u1',
      accountId: VALID_CUID,
      rawQuery: {
        accountId: VALID_CUID,
        fromDate: '2026-01-01',
        toDate: '2027-01-02',
      },
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
  });
});
