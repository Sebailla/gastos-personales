/**
 * In-memory test fixture: `InMemoryTransactionRepository`.
 *
 * Slice 3 binding. Implements `TransactionRepositoryPort`
 * over a `Map<string, Transaction>` keyed by
 * `${userId}:${id}` — the cross-module invariant from
 * `auth/spec.md:644-647` is enforced at the keying layer
 * (every method requires `userId` and includes it in the
 * lookup; cross-user access returns `null`/`false`).
 *
 * The fixture is PURE: no I/O, no clock side-effects, no
 * logging, no event dispatch. It is used by every action
 * test in slice 3. Slice 4 adds the Prisma adapter for the
 * production path; the test suite swaps implementations
 * via the `TransactionActionDeps.repo` field.
 *
 * Cursor pagination: the cursor is the row's `id` (encoded
 * as the previous page's last row id). The fixture sorts
 * by `transactionDate DESC` (matches the design §6 list
 * shape); the Prisma adapter in slice 4 will use the same
 * ordering and a `[userId, transactionDate, id]` tuple key
 * for stable pagination.
 *
 * Idempotency: `delete` returns `false` on miss and on
 * cross-user. A second `delete` on the same row returns
 * `false` (the row is already gone). The action layer
 * maps `false` to `404 NOT_FOUND`.
 *
 * `id` and timestamps: `create` generates a cuid-shaped
 * `id` (e.g. `tx_<random>`) and stamps `createdAt` /
 * `updatedAt` to the wall clock at insert time. The
 * slice-4 Prisma adapter uses the database to generate
 * these values; the fixture's contract is that the
 * returned row is fully-formed and usable by the action
 * layer.
 */

import {
  type Transaction,
  transactionsEqual,
  applyTransactionPatch,
} from '../../domain/entities/transaction';
import type {
  CreateTransactionInput,
  ListTransactionsOptions,
  ListTransactionsPage,
  TransactionRepositoryPort,
  UpdateTransactionPatch,
} from '../../domain/interfaces/transaction.repository.port';

/**
 * Tiny UUIDv4-based id generator. Format: `tx_<32-char hex>`.
 * Standalone — no `cuid2` dep — because slice 3 tests only
 * need uniqueness, not cryptographic strength. Slice 4
 * replaces this with the Prisma adapter.
 */
function generateId(): string {
  return 'tx_' + crypto.randomUUID().replace(/-/g, '');
}

/**
 * The composite key for the in-memory map. Keys are stable
 * across the test process; values are the full aggregate.
 */
function key(userId: string, id: string): string {
  return `${userId}:${id}`;
}

/**
 * Sort the in-memory rows by `transactionDate DESC`, then
 * `createdAt DESC` (stable secondary key). The slice-4
 * Prisma adapter uses the same shape.
 */
function sortByDateDesc(a: Transaction, b: Transaction): number {
  const aMs = a.transactionDate.getTime();
  const bMs = b.transactionDate.getTime();
  if (aMs !== bMs) return bMs - aMs;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export class InMemoryTransactionRepository implements TransactionRepositoryPort {
  private readonly rows = new Map<string, Transaction>();

  async list(userId: string, opts: ListTransactionsOptions): Promise<ListTransactionsPage> {
    // Filter by userId (cross-module invariant) and
    // optionally by accountId.
    const matching: Transaction[] = [];
    for (const row of this.rows.values()) {
      if (row.userId !== userId) continue;
      if (opts.accountId !== undefined && row.accountId !== opts.accountId) continue;
      matching.push(row);
    }
    matching.sort(sortByDateDesc);

    // Cursor: opaque — encoded as the last row's `id` of
    // the previous page. The fixture's contract: when a
    // cursor is supplied, skip rows up to and including the
    // matching id, then return the next `limit` rows.
    let startIdx = 0;
    if (opts.cursor !== undefined) {
      const cursorIdx = matching.findIndex((r) => r.id === opts.cursor);
      if (cursorIdx >= 0) {
        startIdx = cursorIdx + 1;
      }
    }
    const endIdx = Math.min(startIdx + opts.limit, matching.length);
    const data = matching.slice(startIdx, endIdx);
    const nextCursor = endIdx < matching.length ? (data[data.length - 1]?.id ?? null) : null;
    return { data, nextCursor };
  }

  async findById(userId: string, id: string): Promise<Transaction | null> {
    const row = this.rows.get(key(userId, id));
    return row ?? null;
  }

  async create(userId: string, input: CreateTransactionInput): Promise<Transaction> {
    const id = generateId();
    const now = new Date();
    const base: Omit<Transaction, 'equals' | 'withUpdates'> = {
      id,
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
      createdAt: now,
      updatedAt: now,
    };
    // Reuse the slice-1 `applyTransactionPatch` to attach
    // the equals / withUpdates methods (no-op patch).
    const tx = applyTransactionPatch(base as Transaction, {}, now);
    this.rows.set(key(userId, id), tx);
    return tx;
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateTransactionPatch,
  ): Promise<Transaction | null> {
    const existing = this.rows.get(key(userId, id));
    if (!existing) return null;
    const now = new Date();
    const updated = applyTransactionPatch(existing, patch, now);
    this.rows.set(key(userId, id), updated);
    return updated;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.rows.delete(key(userId, id));
  }

  /**
   * Test-only helpers (NOT on the port). Used by action
   * tests that need to set up state outside the `create`
   * flow. Kept off the port to preserve the public surface.
   */
  __testInsertRaw(row: Transaction): void {
    this.rows.set(key(row.userId, row.id), row);
  }

  __testEquals(a: Transaction, b: Transaction): boolean {
    return transactionsEqual(a, b);
  }
}
