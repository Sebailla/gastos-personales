/**
 * TransactionRepositoryPrisma — Prisma adapter for the
 * `TransactionRepositoryPort`.
 *
 * Implements every method on the port by issuing a Prisma
 * query against the singleton `prisma.transaction`
 * delegate. The adapter does NOT know about Hono, Auth.js,
 * or Zod; it is the only place in the transactions module
 * that imports from `@/shared/db/prisma-types`
 * (architecture-standards rule).
 *
 * Cross-module invariant (BR-TX-4): every method carries
 * `userId` in the WHERE clause; the application layer
 * cannot accidentally request another user's data because
 * the type signature forces it to pass `userId`. Mirrors
 * the same invariant the accounts port enforces; both
 * layers are tested for it.
 *
 * Cursor pagination: the cursor is the previous page's
 * last row `id`. The Prisma `findMany` is invoked with
 * `(transactionDate DESC, id)` ordering (the design §7.3
 * list shape); the cursor translates to a
 * `cursor: { id } + skip: 1` pair, which Prisma applies
 * AFTER the ordering — yielding the next page in
 * transactionDate DESC order. The fixture's contract
 * (`InMemoryTransactionRepository`) is identical.
 *
 * Idempotency: `delete` returns `false` on miss and on
 * cross-user. A second `delete` on the same row returns
 * `false` (the row is already gone). The action layer
 * maps `false` to `404 NOT_FOUND`.
 *
 * `id` and timestamps: `create` lets Prisma generate
 * the `id` (cuid), `createdAt`, and `updatedAt`. The
 * fixture generates these in JS; the production adapter
 * delegates to the database.
 *
 * Slice 4 refactor: the narrow `PrismaTransactionDelegate`
 * (see `@/shared/db/prisma-types`) is `object`-typed for
 * inputs and `Promise<unknown>` / specific shapes for
 * returns (§10.5 — no `any`). The adapter's row mapper
 * narrows the `unknown` return to the domain `Transaction`
 * shape.
 */

import { Prisma } from '@prisma/client';
import type {
  Transaction,
  TransactionDirection,
} from '../../domain/entities/transaction';
import {
  AccountCurrency,
  AccountFxCasa,
} from '@/shared/domain-kernel';
import {
  attachTransactionMethods,
} from '../../domain/entities/transaction';
import type {
  CreateTransactionInput,
  ListTransactionsOptions,
  ListTransactionsPage,
  TransactionRepositoryPort,
  UpdateTransactionPatch,
} from '../../domain/interfaces/transaction.repository.port';
import type { PrismaTransactionDelegate } from '@/shared/db/prisma-types';

// Row shape produced by the narrow delegate. The shared
// `PrismaTransactionDelegate` returns `Promise<unknown>` after
// the slice-4 §10.5 refactor (no `any`); the row type alias
// here re-introduces the minimum structural shape the mapper
// needs. The cast inside `mapRow` is safe because the caller
// (this adapter) only feeds rows the Prisma client produced.
type PrismaTransactionRow = Record<string, unknown>;

export class TransactionRepositoryPrisma implements TransactionRepositoryPort {
  constructor(
    private readonly prisma: { transaction: PrismaTransactionDelegate },
  ) {}

  async list(userId: string, opts: ListTransactionsOptions): Promise<ListTransactionsPage> {
    const where: Prisma.TransactionWhereInput = { userId };
    if (opts.accountId !== undefined) {
      where.accountId = opts.accountId;
    }
    // Slice-4 refactor: the narrow delegate (no `any` —
    // §10.5) accepts `object` inputs. The literal below
    // is structurally an `object`; the cast is a no-op
    // at runtime.
    const rows = (await this.prisma.transaction.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      take: opts.limit + 1, // +1 to detect a nextCursor
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    } as object)) as unknown[];
    const data = rows
      .slice(0, opts.limit)
      .map((r) => mapRow(r as PrismaTransactionRow));
    const nextCursor =
      rows.length > opts.limit ? (data[data.length - 1]?.id ?? null) : null;
    return { data, nextCursor };
  }

  async findById(userId: string, id: string): Promise<Transaction | null> {
    // Cross-user guard: include userId in the WHERE so a row
    // owned by another user is invisible to this query. The
    // type signature forces the caller to pass userId.
    const row = await this.prisma.transaction.findFirst({
      where: { id, userId },
    } as object);
    if (!row) return null;
    return mapRow(row as PrismaTransactionRow);
  }

  async create(userId: string, input: CreateTransactionInput): Promise<Transaction> {
    const row = (await this.prisma.transaction.create({
      data: {
        userId,
        accountId: input.accountId,
        direction: input.direction,
        amountMinor: input.amountMinor,
        currency: input.currency,
        memo: input.memo,
        category: input.category,
        transactionDate: input.transactionDate,
        convertedAmountMinor: input.convertedAmountMinor,
        convertedCurrency: input.convertedCurrency,
        fxAsOfSnapshot: input.fxAsOfSnapshot,
        casaSnapshot: input.casaSnapshot,
      },
    } as object)) as PrismaTransactionRow;
    return mapRow(row);
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateTransactionPatch,
  ): Promise<Transaction | null> {
    // Cross-user guard via WHERE userId = ? + id = ?
    const data: Record<string, unknown> = {};
    if (patch.amountMinor !== undefined) data['amountMinor'] = patch.amountMinor;
    if (patch.currency !== undefined) data['currency'] = patch.currency;
    if (patch.memo !== undefined) data['memo'] = patch.memo;
    if (patch.category !== undefined) data['category'] = patch.category;
    if (patch.transactionDate !== undefined) data['transactionDate'] = patch.transactionDate;
    if (patch.convertedAmountMinor !== undefined) {
      data['convertedAmountMinor'] = patch.convertedAmountMinor;
    }
    if (patch.convertedCurrency !== undefined) {
      data['convertedCurrency'] = patch.convertedCurrency;
    }
    if (patch.fxAsOfSnapshot !== undefined) data['fxAsOfSnapshot'] = patch.fxAsOfSnapshot;
    if (patch.casaSnapshot !== undefined) data['casaSnapshot'] = patch.casaSnapshot;

    const result = await this.prisma.transaction.updateMany({
      where: { id, userId },
      data,
    } as object);
    if (result.count === 0) return null;
    return this.findById(userId, id);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.transaction.deleteMany({
      where: { id, userId },
    } as object);
    return result.count > 0;
  }
}

function mapRow(row: PrismaTransactionRow): Transaction {
  // Slice-4 refactor: the narrow `PrismaTransactionDelegate`
  // returns `Promise<unknown>` (§10.5 — no `any`). The mapper
  // narrows each field back to its domain type via `as`; the
  // cast is safe because the caller (this adapter) only
  // feeds rows the Prisma client produced.
  const valueFields: Omit<Transaction, 'equals' | 'withUpdates'> = {
    id: row['id'] as string,
    userId: row['userId'] as string,
    accountId: row['accountId'] as string,
    direction: row['direction'] as TransactionDirection,
    amountMinor: row['amountMinor'] as number,
    currency: row['currency'] as AccountCurrency,
    memo: (row['memo'] as string | null) ?? null,
    category: (row['category'] as string | null) ?? null,
    transactionDate: row['transactionDate'] as Date,
    convertedAmountMinor: row['convertedAmountMinor'] as number,
    convertedCurrency: row['convertedCurrency'] as AccountCurrency,
    fxAsOfSnapshot: (row['fxAsOfSnapshot'] as Date | null) ?? null,
    casaSnapshot: (row['casaSnapshot'] as AccountFxCasa | null) ?? null,
    createdAt: row['createdAt'] as Date,
    updatedAt: row['updatedAt'] as Date,
  };
  // `attachTransactionMethods` re-uses the slice-1 factory's
  // `withUpdates` / `equals` helpers — the same shape the
  // `InMemoryTransactionRepository` fixture produces. The
  // `updatedAt` value is what Prisma stamped on the row
  // (which may differ from the input wall clock — the
  // production DB is authoritative).
  return attachTransactionMethods(valueFields);
}
