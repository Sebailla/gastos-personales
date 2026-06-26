/**
 * Kernel port: `TransactionRepositoryPort` (read-only surface
 * for the `reports` module).
 *
 * Mirrors the canonical transactions port at
 * `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`
 * but exposes only the `list` method that the reports aggregates
 * consume. The structural subtyping rule (a Prisma adapter that
 * satisfies the canonical port is assignable to the narrower
 * kernel port) preserves type safety.
 *
 * The kernel port lives at `@/shared/domain-kernel` because it is
 * the cross-module contract surface. The canonical port in
 * `@/modules/transactions` is the writer's view (full CRUD);
 * the kernel port is the reader's view (read-only list). The two
 * are structurally compatible — the reports module never needs
 * `create`, `update`, or `delete` on the kernel port.
 *
 * Kernel-owning-types pattern (per GGA review): this file
 * declares the structural types the reports module reads
 * (`TransactionDTO`, `ListTransactionsOptions`,
 * `ListTransactionsPage`, `TransactionRepositoryPort`) inside
 * the kernel with **no** imports from `@/modules/transactions/...`.
 * The canonical `Transaction` aggregate stays where it is owned;
 * the future Prisma adapter in
 * `src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts`
 * (slice 3) maps the canonical `Transaction` rows to the kernel's
 * `TransactionDTO` before returning them to the reports domain
 * layer. This keeps the dependency arrow strictly
 * `reports → kernel` (no back-edge into transactions).
 *
 * GGA note (slice 1, code-review follow-up): the kernel port
 * declares its own structural subset of `Transaction` because
 * the reports aggregates consume only 9 of the 15 value fields
 * the canonical aggregate exposes (`equals` and `withUpdates`
 * are methods, not fields, so the value-field total is 15 —
 * confirmed at
 * `src/modules/transactions/domain/entities/transaction.ts:71-91`).
 * The mapping lives at the adapter boundary (slice 3). The
 * reports domain layer imports the kernel barrel and never
 * reaches into `@/modules/transactions`.
 */

import type { AccountCurrency } from '../enums/account-currency';

/**
 * Wire-aligned `Transaction` snapshot the reports module reads.
 *
 * This is a structural subset of the canonical `Transaction`
 * aggregate (defined in
 * `src/modules/transactions/domain/entities/transaction.ts`);
 * the reports aggregates consume only the fields below. The
 * future Prisma adapter maps the full 15-value-field row to
 * this 9-field DTO before returning it from `list(...)`.
 *
 * The mapping table (canonical → DTO):
 * - `id`                   → `id`
 * - `userId`               → `userId`
 * - `accountId`            → `accountId`
 * - `direction`            → `direction`
 * - `category`             → `category`
 * - `memo`                 → `memo` (kept for traceability; the
 *                            reports aggregates do not surface
 *                            it on the wire but the canonical
 *                            row carries it).
 * - `transactionDate`      → `transactionDate`
 * - `convertedAmountMinor` → `convertedAmountMinor`
 * - `convertedCurrency`    → `convertedCurrency`
 *
 * Fields the reports module does NOT read (and therefore are
 * NOT on the DTO): `amountMinor`, `currency`, `fxAsOfSnapshot`,
 * `casaSnapshot`, `createdAt`, `updatedAt`. Aggregations operate
 * exclusively on the converted-amount snapshot per BR-ACC-12.
 */
export interface TransactionDTO {
  readonly id: string;
  readonly userId: string;
  readonly accountId: string;
  readonly direction: TransactionDirectionLiteral;
  readonly category: string | null;
  readonly memo: string | null;
  readonly transactionDate: Date;
  readonly convertedAmountMinor: number;
  readonly convertedCurrency: AccountCurrency;
}

/**
 * Transaction direction used by the kernel's `TransactionDTO`. The
 * literal union mirrors the canonical `TransactionDirection` const
 * at `@/modules/transactions/domain/entities/transaction-direction.ts`
 * one-to-one; declared inline here so the kernel port does not
 * import from `@/modules/transactions`. A future refactor may
 * promote the canonical const into the kernel (and have the
 * transactions module conform); for slice 1 the inline union is
 * the price of kernel independence.
 *
 * `TRANSFER` is reserved for v1.1; the reports module never
 * surfaces transfer rows in v1 but the literal is included so
 * the DTO is forward-compatible with the canonical enum.
 */
export type TransactionDirectionLiteral = 'INCOME' | 'EXPENSE' | 'TRANSFER';

/**
 * Cursor-paginated list options (kernel structural subset).
 * Identical to the canonical `ListTransactionsOptions` but
 * declared in the kernel so the kernel port stands on its own.
 * The reports module does not page — its read path uses bounded
 * UTC windows from the `findByUserAndMonth` family of methods.
 * `cursor` is included for adapter compatibility with the
 * canonical port's signature but reports ignores it.
 */
export interface ListTransactionsOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly accountId?: string;
}

/**
 * Cursor-paginated list result (kernel structural subset).
 * The reports module does not page; it reads the bounded window
 * the port returns. `nextCursor` is present so the adapter can
 * satisfy the canonical port's signature but the reports code
 * never reads it.
 */
export interface ListTransactionsPage {
  readonly data: readonly TransactionDTO[];
  readonly nextCursor: string | null;
}

/**
 * Read-only surface of `TransactionRepositoryPort` consumed by the
 * `reports` module. The Prisma adapter that satisfies the canonical
 * `TransactionRepositoryPort` (full CRUD) is structurally assignable
 * to this kernel port because the read-only method set is a subset
 * of the canonical surface (the kernel port declares `list` only).
 *
 * Cross-module invariant (BR-TX-4): every method accepts `userId`
 * as the first argument and scopes the underlying WHERE clause.
 * Reports inherits this invariant — there is no `findById(id)`
 * overload on the kernel port.
 */
export interface TransactionRepositoryPort {
  /**
   * List the user's transactions, ordered by `transactionDate`
   * DESC, optionally filtered by `accountId`. Returns the
   * `TransactionDTO[]` payload the reports aggregates need (no
   * Prisma aggregation — the reports module consumes the
   * wire-aligned DTO and aggregates in the domain layer).
   */
  list(userId: string, opts: ListTransactionsOptions): Promise<ListTransactionsPage>;
}

// The kernel barrel (`src/shared/domain-kernel/index.ts`) already
// re-exports `AccountCurrency` and `AccountFxCasa`; the port
// uses them internally only — no re-export needed at this layer.
