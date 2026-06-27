/**
 * `ReportsRepositoryPrisma` adapter test (T-RPT-206).
 *
 * Mirrors the slice-4 transactions adapter pattern: a
 * structural fake kernel-port injection. The adapter is
 * exercised through its public surface (`ReportsRepositoryPort`)
 * with a hand-built in-memory `TransactionRepositoryPort`-shaped
 * fake. No testcontainers, no real Postgres — the goal is to
 * pin the adapter's behaviour against the port contract and
 * the cross-module invariants.
 *
 * 4 cases:
 *   1. `findByUserAndMonth` widens [year, month] to UTC
 *      [year-month-01 00:00:00.000Z, year-(month+1)-01
 *      00:00:00.000Z) and returns the rows whose
 *      `transactionDate` falls in that window.
 *   2. Cross-user rows are not returned (BR-TX-4
 *      cross-module invariant).
 *   3. `findByUserAccountAndRange` filters by `accountId` +
 *      date range.
 *   4. Empty range returns `[]`.
 *
 * Why a fake instead of testcontainers: the design's
 * `database` requirement is satisfied by the existing
 * transactions + accounts adapters (each tested via
 * structural fakes). Adding testcontainers to the reports
 * slice would not increase coverage because the adapter
 * composes on top of the existing `TransactionRepositoryPort`
 * kernel port — the SQL boundary is exercised in the
 * transactions tests.
 *
 * Per design §11.4.
 */

import { describe, it, expect, vi } from 'vitest';
import { ReportsRepositoryPrisma } from './reports.repository.prisma';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { TransactionDTO } from '@/shared/domain-kernel';

interface FakeList {
  list: ReturnType<typeof vi.fn>;
}

function buildFakeList(rows: readonly TransactionDTO[]): FakeList {
  return {
    list: vi.fn(async (userId: string, opts: { limit: number; accountId?: string }) => {
      const matching = rows
        .filter((r) => r.userId === userId)
        .filter((r) => opts.accountId === undefined || r.accountId === opts.accountId);
      return { data: matching, nextCursor: null };
    }),
  };
}

const U1_ACCOUNT_A = 'c1111111111111111111111aa';
const U1_ACCOUNT_B = 'c2222222222222222222222bb';
const U2_ACCOUNT = 'c3333333333333333333333cc';

const U1_A_JUNE_5: TransactionDTO = {
  id: 'tx_u1_a_5',
  userId: 'u1',
  accountId: U1_ACCOUNT_A,
  direction: 'INCOME',
  category: 'Salary',
  memo: null,
  transactionDate: new Date(Date.UTC(2026, 5, 5, 12, 0, 0, 0)),
  convertedAmountMinor: 100000,
  convertedCurrency: AccountCurrency.ARS,
};
const U1_A_JULY_1: TransactionDTO = {
  id: 'tx_u1_a_70',
  userId: 'u1',
  accountId: U1_ACCOUNT_A,
  direction: 'INCOME',
  category: null,
  memo: null,
  transactionDate: new Date(Date.UTC(2026, 6, 1, 0, 0, 1, 0)),
  convertedAmountMinor: 999,
  convertedCurrency: AccountCurrency.ARS,
};
const U1_B_JUNE_25: TransactionDTO = {
  id: 'tx_u1_b_25',
  userId: 'u1',
  accountId: U1_ACCOUNT_B,
  direction: 'EXPENSE',
  category: 'Food',
  memo: null,
  transactionDate: new Date(Date.UTC(2026, 5, 25, 12, 0, 0, 0)),
  convertedAmountMinor: -5000,
  convertedCurrency: AccountCurrency.ARS,
};
const U2_CROSS: TransactionDTO = {
  id: 'tx_u2_x_5',
  userId: 'u2',
  accountId: U2_ACCOUNT,
  direction: 'INCOME',
  category: null,
  memo: null,
  transactionDate: new Date(Date.UTC(2026, 5, 5, 12, 0, 0, 0)),
  convertedAmountMinor: 9999999,
  convertedCurrency: AccountCurrency.USD,
};

const SEED_ROWS: readonly TransactionDTO[] = [U1_A_JUNE_5, U1_A_JULY_1, U1_B_JUNE_25, U2_CROSS];

describe('ReportsRepositoryPrisma (structural fake injection)', () => {
  it('findByUserAndMonth returns only rows in the UTC month window', async () => {
    const fake = buildFakeList(SEED_ROWS);
    const repo = new ReportsRepositoryPrisma({ transactionRepository: fake });
    const rows = await repo.findByUserAndMonth('u1', { year: 2026, month: 6 });
    expect(rows.map((r) => r.id)).toEqual([U1_A_JUNE_5.id, U1_B_JUNE_25.id]);
    // The adapter called list with `limit: 10_000` and no
    // accountId filter for the monthly read.
    const lastCall = fake.list.mock.calls.at(-1)?.[1] as { limit: number; accountId?: string };
    expect(lastCall.limit).toBe(10_000);
    expect(lastCall.accountId).toBeUndefined();
  });

  it('does not return cross-user rows (BR-TX-4)', async () => {
    const fake = buildFakeList(SEED_ROWS);
    const repo = new ReportsRepositoryPrisma({ transactionRepository: fake });
    const rows = await repo.findByUserAndMonth('u1', { year: 2026, month: 6 });
    expect(rows.every((r) => r.userId === 'u1')).toBe(true);
  });

  it('findByUserAccountAndRange filters by accountId + date range', async () => {
    const fake = buildFakeList(SEED_ROWS);
    const repo = new ReportsRepositoryPrisma({ transactionRepository: fake });
    const rows = await repo.findByUserAccountAndRange('u1', {
      accountId: U1_ACCOUNT_A,
      fromDate: new Date(Date.UTC(2026, 5, 1, 0, 0, 0, 0)),
      toDate: new Date(Date.UTC(2026, 5, 7, 23, 59, 59, 999)),
    });
    expect(rows.map((r) => r.id)).toEqual([U1_A_JUNE_5.id]);
    // The adapter called list with the accountId filter.
    const lastCall = fake.list.mock.calls.at(-1)?.[1] as { limit: number; accountId?: string };
    expect(lastCall.accountId).toBe(U1_ACCOUNT_A);
  });

  it('returns [] for an empty range', async () => {
    const fake = buildFakeList(SEED_ROWS);
    const repo = new ReportsRepositoryPrisma({ transactionRepository: fake });
    const rows = await repo.findByUserAccountAndRange('u1', {
      accountId: U1_ACCOUNT_A,
      fromDate: new Date(Date.UTC(2027, 0, 1, 0, 0, 0, 0)),
      toDate: new Date(Date.UTC(2027, 0, 7, 23, 59, 59, 999)),
    });
    expect(rows).toEqual([]);
  });
});
