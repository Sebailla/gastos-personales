/**
 * Port: AccountRepositoryPort.
 *
 * The accounts domain's only path to read or write
 * `FinancialAccount` rows. Implemented in PR-B by
 * `AccountRepositoryPrisma` (the Prisma adapter); in this
 * PR-A, only the port declaration and the test fake
 * `FakeAccountRepository` exist.
 *
 * Cross-module invariant: every method accepts `userId`
 * as a required argument and ALWAYS includes it in the
 * underlying WHERE clause. There is no `findById(id)` API
 * that could leak cross-user rows — the application layer
 * can never accidentally request another user's data.
 * This is the same invariant the auth module's
 * `UserRepositoryPort` enforces; both layers are tested
 * for it.
 *
 * Pagination: `list` returns `{ data, nextCursor }`. The
 * `cursor` is opaque (Prisma's `cuid` + `id` in the
 * `accounts-ledger` impl); the domain layer treats it as a
 * string and the application layer passes it through.
 * `count` reports the total rows matching the same filter
 * (no limit/cursor) so the UI can render
 * "Showing first 20 of N" without a second round trip.
 */

import type {
  AccountCurrency,
  AccountFxCasa,
  AccountType,
  FinancialAccount,
} from '../entities/financial-account';
import type { Clock } from '@/shared/clock/clock.port';

export interface ListAccountsOptions {
  readonly cursor?: string;
  readonly limit: number; // 1..100, enforced at the API boundary
  readonly archivedAt?: null; // the only value the smoke UI uses
}

export interface ListAccountsPage {
  readonly data: FinancialAccount[];
  readonly nextCursor: string | null;
}

/**
 * `archivedAt` filter for `count`. The smoke UI only ever
 * passes `null` (live rows); the `{ not: null }` branch
 * is reserved for a future "show archived" filter.
 */
export type CountArchivedFilter = null | { not: null };

export interface CountAccountsOptions {
  readonly archivedAt?: CountArchivedFilter;
}

export interface CreateFinancialAccountInput {
  readonly type: AccountType;
  readonly name: string;
  readonly currency: AccountCurrency;
  readonly openingBalanceMinor: number;
  readonly openingBalanceMode: 'FRESH' | 'HISTORICAL';
  readonly openingBalanceDate: Date | null;

  // Type-specific fields (populated only for the relevant `type`).
  // The Zod schema in PR-B enforces the per-type visibility rule;
  // the domain layer treats them as nullable.
  readonly bankName: string | null;
  readonly accountKind: 'SAVINGS' | 'CHECKING' | null;
  readonly issuer: string | null;
  readonly creditLimitMinor: number | null;
  readonly statementDay: number | null;
  readonly paymentDueDay: number | null;
  readonly broker: string | null;
  readonly investmentType:
    | 'STOCKS'
    | 'BONDS'
    | 'MUTUAL_FUNDS'
    | 'CERTS_OF_DEPOSIT'
    | 'OTHER'
    | null;
  readonly walletAddress: string | null;

  // fx-cache PR-2 — REQ-FX-9. Per-account casa selection
  // (nullable). When omitted, the row lands with `casa = NULL`
  // and inherits the global default at the action site (PR-3).
  // The Zod schema in `account-create.schema.ts` validates the
  // uppercase `AccountFxCasa` form; the application layer
  // translates from the lowercase DolarAPI wire form when the
  // request body carries it.
  readonly casa?: AccountFxCasa | null;
}

export interface UpdateFinancialAccountPatch {
  name?: string;
  currency?: AccountCurrency;
  openingBalanceMinor?: number;
  openingBalanceMode?: 'FRESH' | 'HISTORICAL';
  openingBalanceDate?: Date | null;
  bankName?: string | null;
  accountKind?: 'SAVINGS' | 'CHECKING' | null;
  issuer?: string | null;
  creditLimitMinor?: number | null;
  statementDay?: number | null;
  paymentDueDay?: number | null;
  broker?: string | null;
  investmentType?: 'STOCKS' | 'BONDS' | 'MUTUAL_FUNDS' | 'CERTS_OF_DEPOSIT' | 'OTHER' | null;
  walletAddress?: string | null;
  // fx-cache PR-2 — REQ-FX-9. Per-account casa selection
  // (partial — omitted key means "do not change this field").
  // Accepts null explicitly so the user can clear an existing
  // casa and revert to inheriting the global default.
  casa?: AccountFxCasa | null;
}

export interface AccountRepositoryPort {
  /** List the user's accounts, ordered by createdAt DESC. */
  list(userId: string, opts: ListAccountsOptions): Promise<ListAccountsPage>;

  /** Total rows matching the same filter as `list` (no limit,
   *  no cursor). Used by the UI to render the "Showing first N
   *  of M" footer. */
  count(userId: string, opts?: CountAccountsOptions): Promise<number>;

  /** Find one account by id, scoped to the userId. Returns null on miss
   *  OR on cross-user access (the caller cannot distinguish; this is
   *  the cross-module invariant). */
  findById(userId: string, id: string): Promise<FinancialAccount | null>;

  /** Insert a new account owned by userId. Throws AppError(NAME_TAKEN)
   *  on the @@unique([userId, type, name]) constraint. */
  create(userId: string, input: CreateFinancialAccountInput): Promise<FinancialAccount>;

  /** Partial update of an account owned by userId. Returns
   *  `null` on miss or cross-user; the service layer throws
   *  `AppError(NOT_FOUND)` so the port stays free of business
   *  exceptions. */
  update(
    userId: string,
    id: string,
    patch: UpdateFinancialAccountPatch,
  ): Promise<FinancialAccount | null>;

  /** Set archivedAt = clock.now() on a live account. Idempotent:
   *  archives only if the row is currently live (`archivedAt = null`).
   *  Returns `null` on miss or cross-user (same pattern as `update`). */
  archive(userId: string, id: string, clock: Clock): Promise<FinancialAccount | null>;

  /** Set archivedAt = null on an archived account. Idempotent:
   *  unarchives only if the row is currently archived (`archivedAt != null`).
   *  Returns `null` on miss or cross-user (same pattern as `update`).
   *  No clock needed: the value written is `null`, not `now()`. */
  unarchive(userId: string, id: string): Promise<FinancialAccount | null>;
}
