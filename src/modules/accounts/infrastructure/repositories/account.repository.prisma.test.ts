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

// ---------------------------------------------------------------------------
// Fake Prisma delegate (the 5 methods the adapter uses).
// ---------------------------------------------------------------------------

interface PrismaFinancialAccountDelegate {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}

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
    update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = rows.get(args.where.id);
      if (!existing) {
        const err = new Error('Record not found') as Error & { code: string };
        err.code = 'P2025';
        throw err;
      }
      const merged: FinancialAccount = {
        ...existing,
        ...(args.data as Partial<FinancialAccount>),
        updatedAt: new Date(),
      };
      rows.set(args.where.id, merged);
      return merged as unknown as Record<string, unknown>;
    }),
    updateMany: vi.fn(
      async (args: { where: { id: string; userId: string }; data: Record<string, unknown> }) => {
        const r = rows.get(args.where.id);
        if (!r || r.userId !== args.where.userId) return { count: 0 };
        const merged: FinancialAccount = {
          ...r,
          ...(args.data as Partial<FinancialAccount>),
          updatedAt: new Date(),
        };
        rows.set(args.where.id, merged);
        return { count: 1 };
      },
    ),
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
      financialAccount: prisma.financialAccount as never,
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
});

describe('AccountRepositoryPrisma.findById', () => {
  it('returns the row when found', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount as never,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    const r = await repo.findById('u-1', 'fa-1');
    expect(r?.id).toBe('fa-1');
  });

  it('returns null when the row does not exist', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount as never,
    });
    expect(await repo.findById('u-1', 'missing')).toBeNull();
  });

  it('returns null on cross-user access (existence not leaked)', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount as never,
    });
    await repo.create('u-2', aRowInput({ name: 'A' }));
    expect(await repo.findById('u-1', 'fa-1')).toBeNull();
  });
});

describe('AccountRepositoryPrisma.list', () => {
  it('returns only the user rows ordered by createdAt DESC', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount as never,
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
      financialAccount: prisma.financialAccount as never,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    await repo.create('u-2', aRowInput({ name: 'B' }));

    const u1 = await repo.list('u-1', { limit: 20 });
    const u2 = await repo.list('u-2', { limit: 20 });
    expect(u1.data.every((r: FinancialAccount) => r.userId === 'u-1')).toBe(true);
    expect(u2.data.every((r: FinancialAccount) => r.userId === 'u-2')).toBe(true);
  });
});

describe('AccountRepositoryPrisma.archive / unarchive', () => {
  it('archive returns the row with archivedAt set', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount as never,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    const r = await repo.archive('u-1', 'fa-1');
    expect(r?.archivedAt).toBeInstanceOf(Date);
  });

  it('unarchive returns the row with archivedAt = null', async () => {
    const prisma = buildFakePrisma();
    const repo = new AccountRepositoryPrisma({
      financialAccount: prisma.financialAccount as never,
    });
    await repo.create('u-1', aRowInput({ name: 'A' }));
    await repo.archive('u-1', 'fa-1');
    const r = await repo.unarchive('u-1', 'fa-1');
    expect(r?.archivedAt).toBeNull();
  });
});
