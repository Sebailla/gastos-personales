/**
 * Slice 4 — Prisma adapter tests for `TransactionRepositoryPrisma`.
 *
 * Strategy: a structural fake Prisma client with a mockable
 * `transaction` delegate. No testcontainers (per slice-4 brief);
 * the tests pin the adapter's behaviour against the port contract
 * and the cross-module invariants.
 *
 * Cross-module invariant covered (BR-TX-4): every method
 * carries `userId` in the WHERE / input; cross-user access
 * returns `null` / `false`. Tested at the Prisma spy level.
 *
 * Coverage (12 cases):
 *  1. create + findById round-trip preserves all 14 fields
 *     incl. the FX snapshot (`fxAsOfSnapshot`, `casaSnapshot`)
 *     and the timestamps.
 *  2. list returns rows ordered by `transactionDate DESC` (then
 *     `id DESC` for tie-break), scoped to `userId`.
 *  3. list cursor pagination — page 2 returns DIFFERENT rows
 *     than page 1, and the cursor payload is passed to Prisma.
 *  4. list with `accountId` filter narrows the page to one
 *     account (REQ-TX-10).
 *  5. findById cross-user returns `null` (BR-TX-4).
 *  6. update with a partial patch preserves `fxAsOfSnapshot`
 *     when only `memo` is patched (the FX snapshot is sticky).
 *  7. update cross-user returns `null` (BR-TX-4).
 *  8. delete returns `true` on a hit.
 *  9. delete returns `false` on a miss (idempotent: a second
 *     delete on the same id returns `false` — the row is gone).
 * 10. delete cross-user returns `false` (BR-TX-4).
 * 11. EVERY method passes `userId` to the Prisma delegate —
 *     the `userId` is visible in the spy args.
 * 12. adapter compiles against the narrow `PrismaTransactionDelegate`
 *     (no `any`, no `as any`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AccountCurrency,
  AccountFxCasa,
  TransactionDirection,
  type Transaction,
} from '../../domain/entities/transaction';
import type {
  CreateTransactionInput,
  ListTransactionsOptions,
} from '../../domain/interfaces/transaction.repository.port';
import type { PrismaTransactionDelegate } from '@/shared/db/prisma-types';
import { TransactionRepositoryPrisma } from './transaction.repository.prisma';

// ---------------------------------------------------------------------------
// Mock Prisma client + delegate factory.
// Slice 4 brief: no testcontainers, no skipped tests. The mock mirrors
// the production Prisma client's surface (the 5 methods the adapter uses)
// and lets each test assert on the spy args.
// ---------------------------------------------------------------------------

interface MockPrismaTransactionDelegate {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}

interface MockPrismaClient {
  transaction: PrismaTransactionDelegate & MockPrismaTransactionDelegate;
}

// Row shape persisted by the mock (mirrors the Prisma `Transaction`
// model after the slice-4 migration). Internal to the test file.
interface MockTransactionRow {
  id: string;
  userId: string;
  accountId: string;
  direction: TransactionDirection;
  amountMinor: number;
  currency: AccountCurrency;
  memo: string | null;
  category: string | null;
  transactionDate: Date;
  convertedAmountMinor: number;
  convertedCurrency: AccountCurrency;
  fxAsOfSnapshot: Date | null;
  casaSnapshot: AccountFxCasa | null;
  createdAt: Date;
  updatedAt: Date;
}

function createMockPrismaClient(): MockPrismaClient {
  const rows = new Map<string, MockTransactionRow>();

  const txDelegate: MockPrismaTransactionDelegate = {
    create: vi.fn(async (args: object) => {
      const a = args as { data: Record<string, unknown> };
      const id = `tx_${rows.size + 1}_${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date();
      const row: MockTransactionRow = {
        id,
        userId: a.data['userId'] as string,
        accountId: a.data['accountId'] as string,
        direction: a.data['direction'] as TransactionDirection,
        amountMinor: a.data['amountMinor'] as number,
        currency: a.data['currency'] as AccountCurrency,
        memo: (a.data['memo'] as string | null | undefined) ?? null,
        category: (a.data['category'] as string | null | undefined) ?? null,
        transactionDate: a.data['transactionDate'] as Date,
        convertedAmountMinor: a.data['convertedAmountMinor'] as number,
        convertedCurrency: a.data['convertedCurrency'] as AccountCurrency,
        fxAsOfSnapshot: (a.data['fxAsOfSnapshot'] as Date | null | undefined) ?? null,
        casaSnapshot: (a.data['casaSnapshot'] as AccountFxCasa | null | undefined) ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(id, row);
      // The adapter reads the row back via the cast to the row
      // shape; the mock returns `unknown` to mirror the narrow
      // delegate signature.
      return row as unknown;
    }),
    findFirst: vi.fn(async (args: object) => {
      const a = args as { where: Record<string, unknown> };
      const idFilter = a.where['id'] as string | undefined;
      const userIdFilter = a.where['userId'] as string | undefined;
      if (!idFilter) return null;
      const r = rows.get(idFilter);
      if (!r) return null;
      if (userIdFilter !== undefined && r.userId !== userIdFilter) return null;
      return r as unknown;
    }),
    findMany: vi.fn(async (args: object) => {
      const a = args as {
        where: Record<string, unknown>;
        orderBy?: { transactionDate?: 'asc' | 'desc'; id?: 'asc' | 'desc' };
        take?: number;
        cursor?: { id: string };
        skip?: number;
      };
      const userIdFilter = a.where['userId'] as string;
      const accountIdFilter = a.where['accountId'] as string | undefined;
      const matching: MockTransactionRow[] = [];
      for (const r of rows.values()) {
        if (r.userId !== userIdFilter) continue;
        if (accountIdFilter !== undefined && r.accountId !== accountIdFilter) continue;
        matching.push(r);
      }
      // Sort: transactionDate DESC, then id DESC (matches the
      // design §7.3 list shape — the `id DESC` tie-break gives
      // stable pagination under concurrent writes).
      matching.sort((x, y) => {
        const dDiff = y.transactionDate.getTime() - x.transactionDate.getTime();
        if (dDiff !== 0) return dDiff;
        // ids are cuid-shaped strings; descending lex order.
        return y.id < x.id ? -1 : y.id > x.id ? 1 : 0;
      });
      let sliced: MockTransactionRow[] = matching;
      if (a.cursor) {
        const idx = sliced.findIndex((r) => r.id === a.cursor!.id);
        if (idx >= 0) sliced = sliced.slice(idx + 1);
      }
      if (a.skip) sliced = sliced.slice(a.skip);
      if (a.take) sliced = sliced.slice(0, a.take);
      return sliced as unknown as unknown[];
    }),
    updateMany: vi.fn(async (args: object) => {
      const a = args as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      const idFilter = a.where['id'] as string;
      const userIdFilter = a.where['userId'] as string;
      const r = rows.get(idFilter);
      if (!r || r.userId !== userIdFilter) return { count: 0 };
      const merged: MockTransactionRow = {
        ...r,
        // Apply each defined field from the patch (undefined keys
        // are no-ops; null keys explicitly clear).
        ...Object.fromEntries(
          Object.entries(a.data).filter(([, v]) => v !== undefined),
        ),
        updatedAt: new Date(),
      } as MockTransactionRow;
      rows.set(idFilter, merged);
      return { count: 1 };
    }),
    deleteMany: vi.fn(async (args: object) => {
      const a = args as { where: Record<string, unknown> };
      const idFilter = a.where['id'] as string;
      const userIdFilter = a.where['userId'] as string;
      const r = rows.get(idFilter);
      if (!r || r.userId !== userIdFilter) return { count: 0 };
      rows.delete(idFilter);
      return { count: 1 };
    }),
  };
  return { transaction: txDelegate as MockPrismaClient['transaction'] };
}

function createInput(overrides: Partial<CreateTransactionInput> = {}): CreateTransactionInput {
  return {
    accountId: 'fa-1',
    direction: TransactionDirection.EXPENSE,
    amountMinor: 1000,
    currency: AccountCurrency.USD,
    memo: 'Coffee',
    category: 'food',
    transactionDate: new Date('2026-06-15T12:00:00.000Z'),
    convertedAmountMinor: 1000,
    convertedCurrency: AccountCurrency.USD,
    fxAsOfSnapshot: null,
    casaSnapshot: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransactionRepositoryPrisma', () => {
  let prisma: MockPrismaClient;
  let repo: TransactionRepositoryPrisma;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    repo = new TransactionRepositoryPrisma({ transaction: prisma.transaction });
  });

  // 1. create + findById round-trip
  it('create + findById round-trip preserves all 14 fields incl. FX snapshot', async () => {
    const fxSnapshot = new Date('2026-06-15T11:55:00.000Z');
    const input = createInput({
      fxAsOfSnapshot: fxSnapshot,
      casaSnapshot: AccountFxCasa.BLUE,
      currency: AccountCurrency.USD,
      convertedCurrency: AccountCurrency.ARS,
      convertedAmountMinor: 1200000,
    });

    const created = await repo.create('u-1', input);
    expect(created.id).toMatch(/^tx_/);
    expect(created.userId).toBe('u-1');
    expect(created.accountId).toBe('fa-1');
    expect(created.direction).toBe(TransactionDirection.EXPENSE);
    expect(created.amountMinor).toBe(1000);
    expect(created.currency).toBe(AccountCurrency.USD);
    expect(created.memo).toBe('Coffee');
    expect(created.category).toBe('food');
    expect(created.transactionDate.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    expect(created.convertedAmountMinor).toBe(1200000);
    expect(created.convertedCurrency).toBe(AccountCurrency.ARS);
    expect(created.fxAsOfSnapshot).not.toBeNull();
    expect(created.fxAsOfSnapshot?.toISOString()).toBe(fxSnapshot.toISOString());
    expect(created.casaSnapshot).toBe(AccountFxCasa.BLUE);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);

    const fetched = await repo.findById('u-1', created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.fxAsOfSnapshot?.toISOString()).toBe(fxSnapshot.toISOString());
  });

  // 2. list orders by transactionDate DESC, scoped to userId
  it('list returns rows ordered by transactionDate DESC, scoped to userId', async () => {
    const a = await repo.create('u-1', createInput({ transactionDate: new Date('2026-06-10T00:00:00.000Z') }));
    const b = await repo.create('u-1', createInput({ transactionDate: new Date('2026-06-15T00:00:00.000Z') }));
    const c = await repo.create('u-1', createInput({ transactionDate: new Date('2026-06-12T00:00:00.000Z') }));
    await repo.create('u-2', createInput({ transactionDate: new Date('2026-06-20T00:00:00.000Z') }));

    const page = await repo.list('u-1', { limit: 20 });
    expect(page.data.map((t: Transaction) => t.id)).toEqual([b.id, c.id, a.id]);
    expect(page.data.every((t: Transaction) => t.userId === 'u-1')).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  // 3. list cursor pagination
  it('list cursor pagination returns different rows on page 2', async () => {
    const created: Transaction[] = [];
    // 5 rows for u-1, spread across distinct transactionDates.
    for (let i = 1; i <= 5; i++) {
      created.push(
        await repo.create(
          'u-1',
          createInput({ transactionDate: new Date(`2026-06-${10 + i}T00:00:00.000Z`) }),
        ),
      );
    }
    // created order: dates 2026-06-11..15. DESC: 15, 14, 13, 12, 11
    const expectedDesc = [...created].sort(
      (x, y) => y.transactionDate.getTime() - x.transactionDate.getTime(),
    );

    const page1 = await repo.list('u-1', { limit: 2 });
    expect(page1.data.map((t: Transaction) => t.id)).toEqual([
      expectedDesc[0]!.id,
      expectedDesc[1]!.id,
    ]);
    expect(page1.nextCursor).toBe(expectedDesc[1]!.id);

    const page2 = await repo.list('u-1', {
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.data.map((t: Transaction) => t.id)).toEqual([
      expectedDesc[2]!.id,
      expectedDesc[3]!.id,
    ]);

    const page1Ids = new Set(page1.data.map((t: Transaction) => t.id));
    const page2Ids = new Set(page2.data.map((t: Transaction) => t.id));
    expect([...page1Ids].every((id) => !page2Ids.has(id))).toBe(true);
  });

  // 4. list with accountId filter (REQ-TX-10)
  it('list with accountId filter narrows the page to that account', async () => {
    await repo.create('u-1', createInput({ accountId: 'fa-1' }));
    await repo.create('u-1', createInput({ accountId: 'fa-1' }));
    await repo.create('u-1', createInput({ accountId: 'fa-2' }));

    const page = await repo.list('u-1', { limit: 20, accountId: 'fa-1' });
    expect(page.data).toHaveLength(2);
    expect(page.data.every((t: Transaction) => t.accountId === 'fa-1')).toBe(true);

    // The Prisma spy received `accountId` in the where payload.
    const findManySpy = prisma.transaction.findMany;
    const lastCall = findManySpy.mock.calls[findManySpy.mock.calls.length - 1]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(lastCall.where['accountId']).toBe('fa-1');
  });

  // 5. findById cross-user returns null (BR-TX-4)
  it('findById returns null on cross-user access (existence not leaked)', async () => {
    const created = await repo.create('u-2', createInput());
    expect(await repo.findById('u-1', created.id)).toBeNull();
  });

  // 6. update partial patch preserves fxAsOfSnapshot
  it('update with memo-only patch preserves fxAsOfSnapshot and casaSnapshot', async () => {
    const fxSnapshot = new Date('2026-06-15T11:55:00.000Z');
    const created = await repo.create(
      'u-1',
      createInput({ fxAsOfSnapshot: fxSnapshot, casaSnapshot: AccountFxCasa.BLUE }),
    );

    const updated = await repo.update('u-1', created.id, { memo: 'Lunch' });
    expect(updated).not.toBeNull();
    expect(updated?.memo).toBe('Lunch');
    expect(updated?.fxAsOfSnapshot?.toISOString()).toBe(fxSnapshot.toISOString());
    expect(updated?.casaSnapshot).toBe(AccountFxCasa.BLUE);
  });

  // 7. update cross-user returns null (BR-TX-4)
  it('update returns null on cross-user access', async () => {
    const created = await repo.create('u-2', createInput());
    expect(await repo.update('u-1', created.id, { memo: 'hijack' })).toBeNull();
  });

  // 8. delete returns true on hit
  it('delete returns true on a hit', async () => {
    const created = await repo.create('u-1', createInput());
    expect(await repo.delete('u-1', created.id)).toBe(true);
    expect(await repo.findById('u-1', created.id)).toBeNull();
  });

  // 9. delete idempotent — second delete returns false
  it('delete is idempotent: a second delete on the same id returns false', async () => {
    const created = await repo.create('u-1', createInput());
    expect(await repo.delete('u-1', created.id)).toBe(true);
    expect(await repo.delete('u-1', created.id)).toBe(false);
  });

  // 10. delete cross-user returns false (BR-TX-4)
  it('delete returns false on cross-user access', async () => {
    const created = await repo.create('u-2', createInput());
    expect(await repo.delete('u-1', created.id)).toBe(false);
  });

  // 11. every method passes userId to the Prisma delegate
  it('every method passes userId to the Prisma delegate (BR-TX-4 enforcement)', async () => {
    const created = await repo.create('u-1', createInput());
    await repo.findById('u-1', created.id);
    await repo.list('u-1', { limit: 20 } as ListTransactionsOptions);
    await repo.update('u-1', created.id, { memo: 'x' });
    await repo.delete('u-1', created.id);

    // Every method's last call has `userId: 'u-1'` somewhere in
    // its `where` (findFirst / findMany) or in its `data` (create)
    // or `where` (updateMany / deleteMany).
    const createCall = prisma.transaction.create.mock.calls.at(-1)?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data['userId']).toBe('u-1');

    const findFirstCall = prisma.transaction.findFirst.mock.calls.at(-1)?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findFirstCall.where['userId']).toBe('u-1');

    const findManyCall = prisma.transaction.findMany.mock.calls.at(-1)?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findManyCall.where['userId']).toBe('u-1');

    const updateManyCall = prisma.transaction.updateMany.mock.calls.at(-1)?.[0] as {
      where: Record<string, unknown>;
    };
    expect(updateManyCall.where['userId']).toBe('u-1');

    const deleteManyCall = prisma.transaction.deleteMany.mock.calls.at(-1)?.[0] as {
      where: Record<string, unknown>;
    };
    expect(deleteManyCall.where['userId']).toBe('u-1');
  });

  // 12. adapter compiles against the narrow delegate (no `any`)
  it('adapter accepts the narrow PrismaTransactionDelegate (compile-time pin)', () => {
    // If this file compiles, the adapter's constructor signature
    // is structurally compatible with the narrow delegate — no
    // `as any` was needed.
    type _Sig = Parameters<typeof TransactionRepositoryPrisma['prototype']['constructor']>[0];
    const _narrowOk: _Sig = { transaction: prisma.transaction };
    void _narrowOk;
  });
});
