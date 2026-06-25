/**
 * Port: `TransactionRepositoryPort`.
 *
 * The transactions domain's only path to read or write
 * `Transaction` rows. The Prisma adapter lands in slice 2
 * (`infrastructure/repositories/transaction.repository.prisma.ts`);
 * slice 1 ships only the port declaration + the compile-time
 * contract test. The InMemory fixture lands in slice 2 alongside
 * the service.
 *
 * Cross-module invariant (BR-TX-4): every method accepts `userId`
 * as the first argument and ALWAYS includes it in the underlying
 * WHERE clause. There is no `findById(id)` API that could leak
 * cross-user rows — the application layer can never accidentally
 * request another user's data. This is the same invariant the
 * accounts port (`AccountRepositoryPort`) enforces; both layers
 * are tested for it.
 *
 * Pagination: `list` returns `{ data, nextCursor }`. The `cursor`
 * is opaque (the slice-2 Prisma adapter uses the row's `id` in
 * a `[userId, transactionDate, id]` tuple key); the domain layer
 * treats it as a string and the application layer passes it
 * through. `limit` is clamped to `1..100` at the API boundary
 * (BR-TX-10).
 *
 * Hard delete (BR-TX-7, DG-TX-15): `delete` returns `boolean`
 * (`true` iff a row was removed, `false` on miss or cross-user).
 * The action layer maps `false` to `404 NOT_FOUND`. Idempotent:
 * a second delete on the same id returns `false` (the row is
 * already gone).
 *
 * Why `boolean` (not `Transaction | null` like the accounts
 * `archive`/`unarchive` methods): v1 hard-deletes — there is no
 * post-state to return. Returning the deleted row would force
 * the adapter to read-then-delete and waste a round-trip.
 */

import { AccountCurrency, AccountFxCasa } from '@/shared/domain-kernel';
import type {
  Transaction,
  TransactionDirection,
  TransactionUpdatePatch,
} from '../entities/transaction';

/**
 * Cursor-paginated list options. `limit` is enforced at the API
 * boundary (Zod clamps to `1..100`); the port does not re-clamp.
 * When `accountId` is supplied, the page is filtered to that
 * account (BR-TX-10).
 */
export interface ListTransactionsOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly accountId?: string;
}

/**
 * Cursor-paginated list result. `nextCursor` is `null` when fewer
 * than `limit` rows remain. The application layer renders the
 * cursor-pagination footer from this shape (mirrors
 * `list-accounts.action.ts`).
 */
export interface ListTransactionsPage {
  readonly data: Transaction[];
  readonly nextCursor: string | null;
}

/**
 * Input to the `create` method. The adapter (slice 2) generates
 * the row's `id`, `createdAt`, and `updatedAt`; every other
 * field is supplied here. The action layer calls this with the
 * FX-snapshot result.
 */
export interface CreateTransactionInput {
  readonly accountId: string;
  readonly direction: TransactionDirection;
  readonly amountMinor: number;
  readonly currency: AccountCurrency;
  readonly memo: string | null;
  readonly category: string | null;
  readonly transactionDate: Date;
  readonly convertedAmountMinor: number;
  readonly convertedCurrency: AccountCurrency;
  readonly fxAsOfSnapshot: Date | null;
  readonly casaSnapshot: AccountFxCasa | null;
}

/**
 * Input to the `update` method. Every field is optional (no-op
 * when omitted). Null values explicitly clear the corresponding
 * field. The port does NOT allow changing `accountId` (a future
 * `transfer` migration absorbs that flow).
 */
export type UpdateTransactionPatch = TransactionUpdatePatch;

/**
 * The port itself. Every method takes `userId` as the first
 * argument. The compile-time contract is asserted in
 * `transaction.repository.port.test.ts` (BR-TX-4).
 */
export interface TransactionRepositoryPort {
  /**
   * List the user's transactions, ordered by `transactionDate`
   * DESC. When `accountId` is supplied, the page is filtered to
   * that account. The `cursor` is opaque; `limit` is enforced at
   * the API boundary.
   */
  list(userId: string, opts: ListTransactionsOptions): Promise<ListTransactionsPage>;

  /**
   * Find one transaction by id, scoped to `userId`. Returns
   * `null` on miss OR on cross-user access (the caller cannot
   * distinguish; this is the cross-module invariant). The
   * application layer maps `null` to `404 NOT_FOUND`.
   */
  findById(userId: string, id: string): Promise<Transaction | null>;

  /**
   * Insert a new transaction owned by `userId`. The `id`,
   * `createdAt`, and `updatedAt` are server-generated inside
   * the adapter (slice 2). Returns the persisted row.
   */
  create(userId: string, input: CreateTransactionInput): Promise<Transaction>;

  /**
   * Partial update of a transaction owned by `userId`. Returns
   * `null` on miss or cross-user (same pattern as `findById`).
   * The service layer throws `AppError(NOT_FOUND)` so the port
   * stays free of business exceptions.
   */
  update(userId: string, id: string, patch: UpdateTransactionPatch): Promise<Transaction | null>;

  /**
   * Hard-delete (BR-TX-7). Returns `true` iff a row was
   * removed; `false` on miss or cross-user. Idempotent: a
   * second delete on the same id returns `false`. The action
   * layer maps `false` to `404 NOT_FOUND`.
   */
  delete(userId: string, id: string): Promise<boolean>;
}
