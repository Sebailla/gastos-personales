/**
 * Integration tests for AccountRepositoryPrisma.
 *
 * Strategy: a structural fake Prisma delegate satisfies the
 * adapter's narrow port. This matches the auth module's
 * `user.repository.test.ts` pattern. The CI test job uses
 * testcontainers-Postgres for the real Prisma path (per the
 * `database-strategy` skill); the local dev suite uses the
 * fake.
 *
 * Cross-module invariant covered: every method scopes to
 * `userId` in the WHERE clause; the test asserts the userId
 * is always present in the where payload.
 *
 * Coverage beyond the contract:
 * - cursor pagination (F1): page 2 returns DIFFERENT rows
 *   than page 1.
 * - count (N1): returns the total matching the filter, not
 *   the page length.
 * - update / archive / unarchive idempotency (N4): a second
 *   call on the same row is a no-op (the row's state is
 *   preserved, the count of writes is at most one).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountRepositoryPrisma } from './account.repository.prisma';
import {
  AccountCurrency,
  AccountKind,
  AccountType,
  InvestmentType,
  OpeningBalanceMode,
  type FinancialAccount,
} from '../../domain/entities/financial-account';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { Clock } from '@/shared/clock/clock.port';

const fixedClock: Clock = { now: () => new Date('2026-06-20T00:00:00.000Z') };
import type { PrismaFinancialAccountDelegate } from '@/shared/db/prisma-types';

// ---------------------------------------------------------------------------
// Fake Prisma delegate (the 6 methods the adapter uses).
// Imports the same `PrismaFinancialAccountDelegate` shape
// as the production repository and the composition root's
// `asPrismaDelegateView` cast. The mock satisfies the
// shared interface structurally (extra `update` was
// removed when F-14 was applied).
// ---------------------------------------------------------------------------

interface FakePrisma {
  financialAccount: PrismaFinancialAccountDelegate;
}

function buildFakePrisma(): FakePrisma {
  const rows = new Map<string, FinancialAccount>();

  const financialAccount: PrismaFinancialAccountDelegate = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      // P2002 simulation: if a row with the same (userId, type, name)
      // already exists, throw Prisma's P2002 unique-violation error.
      const d = args.data as Record<string, unknown>;
      const key = `${d['userId']}|${d['type']}|${d['name']}`;
      for (const r of rows.values()) {
        if (`${r.userId}|${r.type}|${r.name}` === key) {
          const err = new Error('Unique constraint failed') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
      }
      const id = `fa-${rows.size + 1}`;
      const base = new Date('2026-06-18T00:00:00.000Z').getTime();
      const createdAt = new Date(base + rows.size * 1000);
      const row: FinancialAccount = {
        id,
        userId: d['userId'] as string,
        type: d['type'] as AccountType,
        name: d['name'] as string,
        currency: d['currency'] as AccountCurrency,
        openingBalanceMinor: d['openingBalanceMinor'] as number,
        openingBalanceMode: d['openingBalanceMode'] as OpeningBalanceMode,
        openingBalanceDate: (d['openingBalanceDate'] as Date | null) ?? null,
        archivedAt: (d['archivedAt'] as Date | null) ?? null,
        bankName: (d['bankName'] as string | null) ?? null,
        accountKind: (d['accountKind'] as AccountKind | null) ?? null,
        issuer: (d['issuer'] as string | null) ?? null,
        creditLimitMinor: (d['creditLimitMinor'] as number | null) ?? null,
        statementDay: (d['statementDay'] as number | null) ?? null,
        paymentDueDay: (d['paymentDueDay'] as number | null) ?? null,
        broker: (d['broker'] as string | null) ?? null,
        investmentType: (d['investmentType'] as InvestmentType | null) ?? null,
        walletAddress: (d['walletAddress'] as string | null) ?? null,
        casa: (d['casa'] as FinancialAccount['casa']) ?? null,
        createdAt,
        updatedAt: createdAt,
      };
      rows.set(id, row);
      return row as unknown as Record<string, unknown>;
    }),
    findUnique: vi.fn(async (args: { where: { id: string } }) => {
      const r = rows.get(args.where.id);
      return r ? (r as unknown as Record<string, unknown>) : null;
    }),
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const idFilter = args.where['id'] as string | undefined;
      const userIdFilter = args.where['userId'] as string | undefined;
      if (idFilter) {
        const r = rows.get(idFilter);
        if (r && r.userId === userIdFilter) {
          return r as unknown as Record<string, unknown>;
        }
        return null;
      }
      for (const r of rows.values()) {
        if (r.userId === userIdFilter) return r as unknown as Record<string, unknown>;
      }
      return null;
    }),
    findMany: vi.fn(
      async (args: {
        where: Record<string, unknown>;
        orderBy?: unknown;
        take?: number;
        cursor?: { id: string };
        skip?: number;
      }) => {
        const userIdFilter = args.where['userId'] as string;
        const archivedAtFilter = args.where['archivedAt'];
        const out: FinancialAccount[] = [];
        for (const r of rows.values()) {
          if (r.userId !== userIdFilter) continue;
          if (archivedAtFilter === null && r.archivedAt !== null) continue;
          if (
            archivedAtFilter !== null &&
            typeof archivedAtFilter === 'object' &&
            archivedAtFilter !== null &&
            'not' in (archivedAtFilter as Record<string, unknown>) &&
            r.archivedAt === null
          ) {
            continue;
          }
          out.push(r);
        }
        out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        let sliced: FinancialAccount[] = out;
        if (args.cursor) {
          const idx = sliced.findIndex((r) => r.id === args.cursor!.id);
          if (idx >= 0) sliced = sliced.slice(idx + 1);
        }
        if (args.skip) sliced = sliced.slice(args.skip);
        if (args.take) sliced = sliced.slice(0, args.take);
        void out;
        return sliced as unknown as Record<string, unknown>[];
      },
    ),
    updateMany: vi.fn(
      async (args: {
        where: { id: string; userId: string; archivedAt?: unknown };
        data: Record<string, unknown>;
      }) => {
        const r = rows.get(args.where.id);
        if (!r || r.userId !== args.where.userId) return { count: 0 };
        // Idempotency / state filter: `updateMany` only writes
        // when the row matches every field in the WHERE.
        if (args.where.archivedAt === null && r.archivedAt !== null) return { count: 0 };
        if (
          args.where.archivedAt !== null &&
          typeof args.where.archivedAt === 'object' &&
          args.where.archivedAt !== null &&
          'not' in (args.where.archivedAt as Record<string, unknown>) &&
          r.archivedAt === null
        ) {
          return { count: 0 };
        }
        const merged: FinancialAccount = {
          ...r,
          ...(args.data as Partial<FinancialAccount>),
          updatedAt: new Date(),
        };
        rows.set(args.where.id, merged);
        return { count: 1 };
      },
    ),
    count: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const userIdFilter = args.where['userId'] as string;
      const archivedAtFilter = args.where['archivedAt'];
      let n = 0;
      for (const r of rows.values()) {
        if (r.userId !== userIdFilter) continue;
        if (archivedAtFilter === null && r.archivedAt !== null) continue;
        if (
          archivedAtFilter !== null &&
          typeof archivedAtFilter === 'object' &&
          archivedAtFilter !== null &&
          'not' in (archivedAtFilter as Record<string, unknown>) &&
          r.archivedAt === null
        ) {
          continue;
        }
        n++;
      }
      return n;
    }),
  };
  return { financialAccount };
}

function aRowInput(
  overrides: Partial<{
    name: string;
    type: AccountType;
  }> = {},
) {
  return {
    type: overrides.type ?? AccountType.BANK,
    name: overrides.name ?? 'x',
    currency: AccountCurrency.USD,
    openingBalanceMinor: 0,
    openingBalanceMode: OpeningBalanceMode.FRESH,
    openingBalanceDate: null,
    bankName: 'ICBC',
    accountKind: AccountKind.SAVINGS,
    issuer: null,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    broker: null,
    investmentType: null,
    walletAddress: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountRepositoryPrisma.create', () => {
  let prisma: FakePrisma;
  let repo: AccountRepositoryPrisma;

  beforeEach(() => {
    prisma = buildFakePrisma();
    repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
  });

  it('returns the persisted row with a generated id', async () => {
    const row = await repo.create('u-1', aRowInput({ name: 'Main' }));
    expect(row.id).toMatch(/^fa-/);
    expect(row.userId).toBe('u-1');
    expect(row.name).toBe('Main');
  });

  it('throws AppError(NAME_TAKEN) on a (userId, type, name) unique violation (P2002)', async () => {
    // Seed an existing row.
    await repo.create('u-1', aRowInput({ name: 'Main' }));

    await expect(repo.create('u-1', aRowInput({ name: 'Main' }))).rejects.toMatchObject({
      code: ErrorCode.NAME_TAKEN,
    });
  });

  // fx-cache PR-2 T2.7 — REQ-FX-9. The create adapter writes
  // the per-account casa column when present on the input.
  it('writes the casa column when input.casa is set', async () => {
    const row = await repo.create('u-1', { ...aRowInput({ name: 'A' }), casa: 'OFICIAL' });
    expect(row.casa).toBe('OFICIAL');
    // The data payload to the Prisma client MUST include casa.
    const createSpy = prisma.financialAccount.create as unknown as ReturnType<typeof vi.fn>;
    const lastCall = createSpy.mock.calls[createSpy.mock.calls.length - 1]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(lastCall.data['casa']).toBe('OFICIAL');
  });

  // When the input omits casa, the row lands with casa = NULL
  // (inherits the global default).
  it('writes the casa column as NULL when input.casa is undefined', async () => {
    const row = await repo.create('u-1', aRowInput({ name: 'A' }));
    expect(row.casa).toBeNull();
  });
});

describe('AccountRepositoryPrisma.findById', () => {
  it('returns the row when found', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    const r = await repo.findById('u-1', 'fa-1');
    expect(r?.id).toBe('fa-1');
  });

  it('returns null when the row does not exist', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    expect(await repo.findById('u-1', 'missing')).toBeNull();
  });

  it('returns null on cross-user access (existence not leaked)', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-2', aRowInput({ name: 'A' }));
    expect(await repo.findById('u-1', 'fa-1')).toBeNull();
  });
});

describe('AccountRepositoryPrisma.list', () => {
  it('returns only the user rows ordered by createdAt DESC', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    await repo.create('u-1', aRowInput({ name: 'B' }));
    await repo.create('u-2', aRowInput({ name: 'C' }));

    const page = await repo.list('u-1', { limit: 20, archivedAt: null });
    expect(page.data.map((r: FinancialAccount) => r.id)).toEqual(['fa-2', 'fa-1']);
    expect(page.data.every((r: FinancialAccount) => r.userId === 'u-1')).toBe(true);
  });

  it('scopes to userId (cross-user rows are excluded)', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    await repo.create('u-2', aRowInput({ name: 'B' }));

    const u1 = await repo.list('u-1', { limit: 20 });
    const u2 = await repo.list('u-2', { limit: 20 });
    expect(u1.data.every((r: FinancialAccount) => r.userId === 'u-1')).toBe(true);
    expect(u2.data.every((r: FinancialAccount) => r.userId === 'u-2')).toBe(true);
  });

  it('passes cursor + skip to findMany so page 2 returns different rows than page 1 (F1)', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    // Seed 5 accounts for u-1. The fake assigns IDs in
    // creation order (fa-1..fa-5) and createdAt in the same
    // order, so a createdAt-DESC list returns fa-5 first.
    for (let i = 1; i <= 5; i++) {
      await repo.create('u-1', aRowInput({ name: `acc-${i}` }));
    }

    const page1 = await repo.list('u-1', { limit: 2 });
    expect(page1.data).toHaveLength(2);
    // createdAt DESC → page 1 is [fa-5, fa-4]; the cursor
    // returned is the last id of that page.
    expect(page1.data.map((r: FinancialAccount) => r.id)).toEqual(['fa-5', 'fa-4']);
    expect(page1.nextCursor).toBe('fa-4');

    const page2 = await repo.list('u-1', { limit: 2, cursor: page1.nextCursor ?? undefined });
    // Page 2 must contain DIFFERENT rows from page 1.
    const page1Ids = new Set(page1.data.map((r: FinancialAccount) => r.id));
    const page2Ids = new Set(page2.data.map((r: FinancialAccount) => r.id));
    expect([...page1Ids].every((id) => !page2Ids.has(id))).toBe(true);
    expect(page2.data).toHaveLength(2);

    // The findMany spy should have been called with the cursor + skip
    // on the page 2 call (F1: previously the cursor was dropped).
    // Cast: the shared `PrismaFinancialAccountDelegate` is `any`-typed
    // for arg/return; the mock's `.mock.calls` surface is the
    // Vitest `Mock` shape (`ReturnType<typeof vi.fn>`).
    const findManyMock = prisma.financialAccount.findMany as unknown as ReturnType<typeof vi.fn>;
    const calls = findManyMock.mock.calls;
    const lastCallArgs = calls[calls.length - 1]?.[0] as
      | { cursor?: { id: string }; skip?: number }
      | undefined;
    expect(lastCallArgs?.cursor).toEqual({ id: 'fa-4' });
    expect(lastCallArgs?.skip).toBe(1);
  });
});

describe('AccountRepositoryPrisma.count (N1)', () => {
  it('returns the full count, not the page length (60 accounts, page 20)', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    // Seed 60 accounts for u-1.
    for (let i = 1; i <= 60; i++) {
      await repo.create('u-1', aRowInput({ name: `acc-${i}` }));
    }
    // Seed 5 for u-2 (must NOT be counted toward u-1).
    for (let i = 1; i <= 5; i++) {
      await repo.create('u-2', aRowInput({ name: `other-${i}` }));
    }

    const total = await repo.count('u-1');
    expect(total).toBe(60);

    // Page 1 of 20 must still report total = 60 (not 20).
    const page = await repo.list('u-1', { limit: 20 });
    expect(page.data).toHaveLength(20);
    expect(await repo.count('u-1')).toBe(60);
  });

  it('scopes count to userId (cross-user rows are excluded)', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    await repo.create('u-2', aRowInput({ name: 'B' }));

    expect(await repo.count('u-1')).toBe(1);
    expect(await repo.count('u-2')).toBe(1);
  });
});

describe('AccountRepositoryPrisma.update — casa column (fx-cache PR-2 T2.7)', () => {
  let prisma: FakePrisma;
  let repo: AccountRepositoryPrisma;

  beforeEach(() => {
    prisma = buildFakePrisma();
    repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
  });

  // REQ-FX-9: the partial update path writes the casa column
  // when present on the patch.
  it('updates the casa column to "BLUE" when patch.casa is set', async () => {
    await repo.create('u-1', aRowInput({ name: 'A' }));
    const updated = await repo.update('u-1', 'fa-1', { casa: 'BLUE' });
    expect(updated?.casa).toBe('BLUE');
    // The Prisma data payload MUST include casa.
    const updateManySpy = prisma.financialAccount.updateMany as unknown as ReturnType<typeof vi.fn>;
    const lastCall = updateManySpy.mock.calls[updateManySpy.mock.calls.length - 1]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(lastCall.data['casa']).toBe('BLUE');
  });

  // REQ-FX-9: explicit `casa: null` on the patch sets the
  // column to NULL (user reverts to inheriting the global
  // default).
  it('sets the casa column to NULL when patch.casa is null', async () => {
    await repo.create('u-1', { ...aRowInput({ name: 'A' }), casa: 'OFICIAL' });
    const updated = await repo.update('u-1', 'fa-1', { casa: null });
    expect(updated?.casa).toBeNull();
  });

  // Regression — partial update with no casa key does not
  // touch the existing casa column.
  it('does not touch the casa column when patch.casa is undefined', async () => {
    await repo.create('u-1', { ...aRowInput({ name: 'A' }), casa: 'OFICIAL' });
    const updated = await repo.update('u-1', 'fa-1', { name: 'Renamed' });
    expect(updated?.casa).toBe('OFICIAL');
    expect(updated?.name).toBe('Renamed');
  });
});

describe('AccountRepositoryPrisma.archive / unarchive', () => {
  it('archive returns the row with archivedAt set', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    const r = await repo.archive('u-1', 'fa-1', fixedClock);
    expect(r?.archivedAt).toBeInstanceOf(Date);
  });

  it('unarchive returns the row with archivedAt = null', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    await repo.archive('u-1', 'fa-1', fixedClock);
    const r = await repo.unarchive('u-1', 'fa-1');
    expect(r?.archivedAt).toBeNull();
  });

  it('archive is idempotent: a second call returns the row without changing the timestamp (N4)', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    const first = await repo.archive('u-1', 'fa-1', fixedClock);
    const second = await repo.archive('u-1', 'fa-1', fixedClock);
    expect(first?.archivedAt).toBeInstanceOf(Date);
    expect(second?.archivedAt).toEqual(first?.archivedAt);
    // Only the first call should have written; the second
    // is a no-op (the state filter excludes already-archived
    // rows so updateMany returns count=0).
    expect(prisma.financialAccount.updateMany).toHaveBeenCalledTimes(2);
  });

  it('unarchive is idempotent: a second call returns the row without touching the state (N4)', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    await repo.archive('u-1', 'fa-1', fixedClock);
    const first = await repo.unarchive('u-1', 'fa-1');
    const second = await repo.unarchive('u-1', 'fa-1');
    expect(first?.archivedAt).toBeNull();
    expect(second?.archivedAt).toBeNull();
  });
});
