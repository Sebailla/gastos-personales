/**
 * Domain entity: `Transaction`.
 *
 * The single source-of-truth for the user's ledger entries. One
 * row per manual entry. Mirrors the future Prisma `Transaction`
 * model (`prisma/schema.prisma` lands in slice 2; this slice ships
 * the domain shape only) one-to-one.
 *
 * The aggregate holds 14 readonly fields (REQ-TX-1 + REQ-TX-5):
 *   id, userId, accountId, direction, amountMinor, currency, memo,
 *   category, transactionDate, convertedAmountMinor,
 *   convertedCurrency, fxAsOfSnapshot, casaSnapshot, createdAt,
 *   updatedAt.
 *
 * The `TransactionDirection` const lives in
 * `transaction-direction.ts` (UPPERCASE form, mirrors the future
 * Prisma enum).
 *
 * Note on shared enums: `AccountCurrency` and `AccountFxCasa`
 * are imported from `@/shared/domain-kernel`. The transactions
 * module owns `TransactionDirection` (slice-1 local); the shared
 * kernel owns the account enums (the accounts module is the
 * original source of truth; the kernel is the cross-module
 * location).
 *
 * Invariants (enforced by the factory in `create-transaction.ts`):
 * - BR-TX-1: `amountMinor > 0` — sign comes from `direction`.
 * - BR-TX-2: `direction ∈ { INCOME, EXPENSE }` at write.
 * - BR-TX-3: `transactionDate <= Clock.now()`.
 * - BR-TX-6: `fxAsOfSnapshot IS NULL` iff
 *   `currency === convertedCurrency` (no FX call).
 *
 * Methods (attached to the aggregate by the factory in
 * `create-transaction.ts`):
 * - `equals(other)`: value-equality across the 14 fields.
 * - `withUpdates(patch, now)`: pure function that returns a new
 *   aggregate with the patch applied, `updatedAt` advanced to
 *   `now`, and `id` + `createdAt` preserved.
 */

import { TransactionDirection } from './transaction-direction';
import { AccountCurrency, AccountFxCasa } from '@/shared/domain-kernel';

export { TransactionDirection };

/**
 * The patch type consumed by `withUpdates`. Every field is
 * optional (a no-op when omitted). Null values explicitly clear
 * the corresponding field (used for `memo: null` and
 * `category: null`).
 */
export interface TransactionUpdatePatch {
  readonly amountMinor?: number;
  readonly currency?: AccountCurrency;
  readonly memo?: string | null;
  readonly category?: string | null;
  readonly transactionDate?: Date;
  readonly convertedAmountMinor?: number;
  readonly convertedCurrency?: AccountCurrency;
  readonly fxAsOfSnapshot?: Date | null;
  readonly casaSnapshot?: AccountFxCasa | null;
}

/**
 * The `Transaction` aggregate shape. Every value field is
 * `readonly` (immutability at the type level). The two methods
 * (`equals`, `withUpdates`) are attached to the aggregate by the
 * factory in `create-transaction.ts` — they preserve the
 * `readonly` value fields while exposing a small ergonomic API.
 */
export interface Transaction {
  readonly id: string;
  readonly userId: string;
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
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Value equality across the 14 fields. */
  equals(other: Transaction): boolean;
  /** Apply a partial patch and return a new aggregate. */
  withUpdates(patch: TransactionUpdatePatch, now: Date): Transaction;
}

/**
 * Input to the `createTransaction` factory. Same field set as
 * `Transaction` except `id`, `createdAt`, and `updatedAt` come
 * from the caller / injected clock rather than from the database.
 *
 * The factory is the single place that decides the value of
 * `id` (slice 1: caller-supplied; the future Prisma adapter in
 * slice 2 generates the cuid), `createdAt` (`input.now`), and
 * `updatedAt` (`input.now` at create time).
 */
export interface NewTransactionInput {
  readonly id: string;
  readonly userId: string;
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
  readonly now: Date;
}

/**
 * Value-equality across the 14 domain fields. Two `Transaction`
 * rows are equal iff every field matches (incl. `Date` reference
 * equality — the test asserts via `toEqual` which uses
 * `getTime()`-based Date comparison).
 */
export function transactionsEqual(a: Transaction, b: Transaction): boolean {
  return (
    a.id === b.id &&
    a.userId === b.userId &&
    a.accountId === b.accountId &&
    a.direction === b.direction &&
    a.amountMinor === b.amountMinor &&
    a.currency === b.currency &&
    a.memo === b.memo &&
    a.category === b.category &&
    a.transactionDate.getTime() === b.transactionDate.getTime() &&
    a.convertedAmountMinor === b.convertedAmountMinor &&
    a.convertedCurrency === b.convertedCurrency &&
    fxSnapshotEqual(a.fxAsOfSnapshot, b.fxAsOfSnapshot) &&
    a.casaSnapshot === b.casaSnapshot &&
    a.createdAt.getTime() === b.createdAt.getTime() &&
    a.updatedAt.getTime() === b.updatedAt.getTime()
  );
}

function fxSnapshotEqual(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

/**
 * Apply a partial patch to a `Transaction` and return a new
 * aggregate. The original is untouched (immutability). The new
 * aggregate:
 * - keeps `id`, `userId`, `accountId`, `direction`, `createdAt`
 *   from the source (identity is preserved);
 * - applies each non-`undefined` field of the patch;
 * - advances `updatedAt` to the supplied `now` clock value.
 */
export function applyTransactionPatch(
  source: Transaction,
  patch: TransactionUpdatePatch,
  now: Date,
): Transaction {
  // Build the plain value-fields first; then attach the methods
  // via `attachTransactionMethods`. The intermediate type is a
  // structural subset (the 14 readonly fields) so the literal is
  // complete at this point.
  const next: Omit<Transaction, 'equals' | 'withUpdates'> = {
    id: source.id,
    userId: source.userId,
    accountId: source.accountId,
    direction: source.direction,
    amountMinor: patch.amountMinor ?? source.amountMinor,
    currency: patch.currency ?? source.currency,
    memo: patch.memo !== undefined ? patch.memo : source.memo,
    category: patch.category !== undefined ? patch.category : source.category,
    transactionDate: patch.transactionDate ?? source.transactionDate,
    convertedAmountMinor: patch.convertedAmountMinor ?? source.convertedAmountMinor,
    convertedCurrency: patch.convertedCurrency ?? source.convertedCurrency,
    fxAsOfSnapshot:
      patch.fxAsOfSnapshot !== undefined ? patch.fxAsOfSnapshot : source.fxAsOfSnapshot,
    casaSnapshot: patch.casaSnapshot !== undefined ? patch.casaSnapshot : source.casaSnapshot,
    createdAt: source.createdAt,
    updatedAt: now,
  };
  return attachTransactionMethods(next);
}

/**
 * Attach the `equals` and `withUpdates` methods to a plain
 * `Transaction` shape. Used by the factory in
 * `create-transaction.ts` and by `applyTransactionPatch`. The
 * value fields stay `readonly`; the methods close over the
 * source so `equals` and `withUpdates` work on the freshly
 * returned aggregate without the caller re-wrapping.
 */
export function attachTransactionMethods(
  tx: Omit<Transaction, 'equals' | 'withUpdates'>,
): Transaction {
  return {
    ...tx,
    equals: (other: Transaction) => transactionsEqual(tx as Transaction, other),
    withUpdates: (patch: TransactionUpdatePatch, now: Date) =>
      applyTransactionPatch(tx as Transaction, patch, now),
  };
}
