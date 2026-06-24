/**
 * Public surface of the transactions application layer.
 *
 * Slice 3 binding. The barrel re-exports:
 * - the 5 CRUD actions (list, get, create, update, delete);
 * - the 3 Zod validation schemas (create, update, list);
 * - the `TransactionDTO` type + `toTransactionDto` mapper;
 * - the `TransactionActionDeps` deps-bag interface;
 * - the `ActionResult` discriminated union and the
 *   `zodErrorToActionError` / `domainErrorToActionError` /
 *   `mapDomainError` error-mapping helpers (these are the
 *   action-layer's wire envelope — exported for slice-4
 *   Hono route tests that need to assert on the union);
 * - the `InMemoryTransactionRepository` test fixture (so
 *   slice-4 action tests can compose without deep-path
 *   imports);
 * - the domain surface re-exported from `@/modules/transactions/domain`
 *   so application-level consumers (slice-4 service layer,
 *   Hono routes) can reach both the domain and the action
 *   layer via a single import.
 *
 * The barrel does NOT export:
 * - the slice-3 `_narrow.ts` test helper (test-only);
 * - the slice-3 `_shared.ts` internals (`loadParentAccount`,
 *   `checkAccountArchived`, `recomputeFxSnapshot` — these
 *   are application-layer internals, not cross-module
 *   contracts).
 */

export {
  listTransactionsAction,
  type ListTransactionsData,
} from './actions/list-transactions.action';
export { getTransactionAction } from './actions/get-transaction.action';
export { createTransactionAction } from './actions/create-transaction.action';
export { updateTransactionAction } from './actions/update-transaction.action';
export {
  deleteTransactionAction,
  type DeleteTransactionData,
} from './actions/delete-transaction.action';
export {
  type ActionResult,
  type ActionSuccess,
  type ActionFailure,
  type TransactionActionDeps,
  zodErrorToActionError,
  domainErrorToActionError,
  mapDomainError,
} from './actions/_shared';

export {
  TransactionCreateSchema,
  type CreateTransactionInput as CreateTransactionFormInput,
} from './validation/transaction-create.schema';
export {
  TransactionUpdateSchema,
  type UpdateTransactionInput as UpdateTransactionFormInput,
} from './validation/transaction-update.schema';
export {
  TransactionListQuerySchema,
  type TransactionListQuery,
} from './validation/transaction-list.schema';

export { type TransactionDTO, toTransactionDto } from './dto/transaction.dto';

export { InMemoryTransactionRepository } from './fixtures/in-memory-transaction.repository';

// Re-export the domain surface so callers can reach both
// the domain entities and the application actions from a
// single import. The slice-1+2 deviation log (apply-progress
// §"Slice 2 deviations (executed)") documents this dual-mode
// barrel; future shared-kernel refactors may collapse the
// two layers.
export { TransactionDirection, AccountCurrency, AccountFxCasa } from '../domain';
export type {
  Transaction,
  NewTransactionInput,
  TransactionUpdatePatch,
  transactionsEqual,
  applyTransactionPatch,
} from '../domain';
export {
  TransactionDomainError,
  InvalidAmountError,
  InvalidDirectionError,
  FutureTransactionDateError,
} from '../domain';
export { createTransaction } from '../domain';
export type { CreateTransactionDeps } from '../domain';
export type {
  TransactionRepositoryPort,
  ListTransactionsOptions,
  ListTransactionsPage,
  CreateTransactionInput,
  UpdateTransactionPatch,
} from '../domain';
export { convertAndSnapshot, currencyForCasa } from '../domain';
export type { ConvertAndSnapshotInput, FxSnapshot } from '../domain';
export type {
  FxRateProvider,
  FxCasaString,
  FxConversionRequest,
  FxConversionResult,
} from '../domain';
