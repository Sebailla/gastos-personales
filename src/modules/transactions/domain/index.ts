/**
 * Domain barrel: `src/modules/transactions/domain/`.
 *
 * Re-exports the public surface of the transactions domain.
 * Slice 1 + slice 2 surface: the application layer (slice 2)
 * and the `src/modules/transactions/index.ts` (public surface)
 * import from here. The application barrel is the public
 * surface; this is the domain-layer convenience.
 *
 * Exported:
 * - The `Transaction` aggregate (interface + the two pure
 *   helpers `transactionsEqual` and `applyTransactionPatch`).
 * - The `TransactionDirection` const (UPPERCASE, mirrors the
 *   future Prisma enum).
 * - The local mirrors of `AccountCurrency` and `AccountFxCasa`
 *   (see `transaction.ts` for the module-isolation rationale).
 * - The three `NewTransactionInput` / `TransactionUpdatePatch`
 *   input types.
 * - The pure factory `createTransaction` (in
 *   `factories/create-transaction.ts`).
 * - The three domain error classes
 *   (`TransactionDomainError`, `InvalidAmountError`,
 *   `InvalidDirectionError`, `FutureTransactionDateError`).
 * - The `TransactionRepositoryPort` interface and its supporting
 *   types (`ListTransactionsOptions`, `ListTransactionsPage`,
 *   `CreateTransactionInput`, `UpdateTransactionPatch`).
 * - Slice 2: the `FxRateProvider` port mirror and the
 *   `convertAndSnapshot` helper + its types (`FxSnapshot`,
 *   `ConvertAndSnapshotInput`, `FxCasaString`,
 *   `FxConversionRequest`, `FxConversionResult`).
 * - Slice 2: `currencyForCasa` (casa → peer currency mapping)
 *   and `CreateTransactionDeps` (the optional deps bag passed
 *   to the factory).
 *
 * Not exported: the `attachTransactionMethods` internal helper
 * (slice-1 internal — not a cross-module contract).
 */

export {
  type Transaction,
  type NewTransactionInput,
  type TransactionUpdatePatch,
  AccountCurrency,
  AccountFxCasa,
  transactionsEqual,
  applyTransactionPatch,
} from './entities/transaction';
export { TransactionDirection } from './entities/transaction-direction';
export {
  TransactionDomainError,
  InvalidAmountError,
  InvalidDirectionError,
  FutureTransactionDateError,
} from './entities/transaction.errors';
export { createTransaction, type CreateTransactionDeps } from './factories/create-transaction';
export type {
  TransactionRepositoryPort,
  ListTransactionsOptions,
  ListTransactionsPage,
  CreateTransactionInput,
  UpdateTransactionPatch,
} from './interfaces/transaction.repository.port';
export type {
  FxRateProvider,
  FxCasaString,
  FxConversionRequest,
  FxConversionResult,
} from './interfaces/fx-rate-provider.port';
export {
  convertAndSnapshot,
  currencyForCasa,
  type ConvertAndSnapshotInput,
  type FxSnapshot,
} from './services/fx-snapshot';
