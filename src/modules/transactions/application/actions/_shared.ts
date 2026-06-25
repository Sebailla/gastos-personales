/**
 * Shared types and helpers for the 5 transactions actions.
 *
 * Slice 3 binding. Every action returns a discriminated
 * union `ActionResult<T> = { ok: true, value: T } | { ok: false, error: AppError | TransactionDomainError }`.
 * The Hono route layer (slice 4 wires this in `src/modules/api/app.ts`)
 * is the only place that converts these to `c.json(...)`
 * calls.
 *
 * The `TransactionActionDeps` interface is the action's
 * view of the dependency bag. It exposes everything an
 * action needs — the transactions repository, the parent
 * accounts repository (for the BR-TX-5 archived check), the
 * FX provider (passed through to the factory), the clock
 * (for time stamps in `transactions.create` log events),
 * the structured logger (REQ-TX-14), and the event
 * dispatcher (REQ-TX-13).
 *
 * Discriminator design: `ok: true | false`. Success carries
 * `value`; failure carries `error`. Narrowing is `if (res.ok)`.
 *
 * Cross-module rule: this file imports the parent
 * `AccountRepositoryPort` and the `FxRateProvider` port from
 * `@/shared/domain-kernel`. The kernel ports preserve the
 * modules-isolated rule (root AGENTS.md §10.5): consumers
 * depend on the structural minimum surface they need, while
 * the canonical ports in `@/modules/accounts` carry the
 * full surface used by `AccountService`. Drift between the
 * kernel and canonical ports is detected at the type level
 * (a Prisma adapter satisfies the canonical port and is
 * structurally compatible with the kernel port).
 */

import type { ZodError } from 'zod';
import type {
  AccountRepositoryPort,
  FinancialAccountFields as FinancialAccount,
} from '@/shared/domain-kernel';
import type { FxRateProvider } from '@/shared/domain-kernel';
import type { EventDispatcher } from '@/shared/events/event-dispatcher';
import type { logger as LoggerSingleton } from '@/shared/logger/logger';
import { AppError } from '@/shared/errors/app-error';

/**
 * Logger shape consumed by the action layer (mirrors the
 * concrete `logger` exported from `@/shared/logger/logger`).
 * The slice-3 binding pins this type here because the
 * shared module exposes only the singleton — a future
 * `Logger` interface export is a slice-4 follow-up. The
 * action layer types its deps as the structural shape
 * (debug / info / warn / error) rather than the singleton
 * so test fixtures can pass `vi.fn()` partial mocks.
 */
export type Logger = typeof LoggerSingleton;
import {
  FutureTransactionDateError,
  InvalidAmountError,
  InvalidDirectionError,
  TransactionDomainError,
} from '../../domain/entities/transaction.errors';
import { convertAndSnapshot } from '../../domain/services/fx-snapshot';
import type { AccountFxCasa } from '@/shared/domain-kernel';
import type { TransactionRepositoryPort } from '../../domain/interfaces/transaction.repository.port';

export { InvalidAmountError, InvalidDirectionError, FutureTransactionDateError };

/**
 * The action-layer dependency bag. Constructed at the
 * composition root and passed unchanged to every action.
 *
 * `accountRepository` is required only for the create path
 * (the BR-TX-5 archived pre-check). The list / get / update /
 * delete paths do not touch it; the slice-3 tests pass an
 * undefined value (the field is optional) and the production
 * composition root (slice 4) supplies the real port.
 *
 * `clock` is a function (not the project's `Clock` interface)
 * per the slice-3 binding; the slice-4 service layer adopts
 * the full `Clock` interface.
 */
export interface TransactionActionDeps {
  readonly repo: TransactionRepositoryPort;
  readonly accountRepository?: AccountRepositoryPort;
  readonly clock: () => Date;
  readonly logger: Logger;
  readonly dispatcher: EventDispatcher;
  readonly fxRateProvider: FxRateProvider;
}

/**
 * The action result envelope. Success carries `value`;
 * failure carries `error` (which is the typed error
 * surfaced from the action's catch block — usually an
 * `AppError` with the wire code).
 */
export type ActionSuccess<T> = { readonly ok: true; readonly value: T };
export type ActionFailure = {
  readonly ok: false;
  readonly error: AppError | TransactionDomainError;
};
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

/**
 * Translate a ZodError to the standard 400 envelope. The
 * `error` is an `AppError(VALIDATION_ERROR)` carrying the
 * issues list as `details` so the UI can surface the first
 * message via BR-TX-5 / the standard accounts-list pattern.
 *
 * Slice-3 deviation: the action layer inspects the Zod
 * issue list for `transactionDate` `refine` failures and
 * maps them to `FUTURE_DATE_NOT_ALLOWED` instead of the
 * generic `VALIDATION_ERROR`. This matches the slice-3
 * error-mapping table (REQ-TX-4 wire code) and keeps the
 * `Date.now()`-based future-date check at the Zod boundary
 * without duplicating it in the factory.
 *
 * The discriminator is a stable `code` attached via Zod's
 * `params` (see `transaction-create.schema.ts`). Do NOT
 * match on `message` text — i18n / whitespace changes
 * would silently regress the wire contract.
 */
export function zodErrorToActionError(err: ZodError): ActionFailure {
  const futureDateIssue = err.issues.find(
    (issue) =>
      issue.path[0] === 'transactionDate' &&
      issue.code === 'custom' &&
      (issue as { params?: { code?: string } }).params?.code === 'FUTURE_TRANSACTION_DATE',
  );
  if (futureDateIssue) {
    return {
      ok: false,
      error: new AppError({
        code: 'FUTURE_DATE_NOT_ALLOWED',
        message: 'La fecha no puede estar en el futuro.',
        details: err.issues,
      }),
    };
  }
  return {
    ok: false,
    error: new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Datos de entrada inválidos.',
      details: err.issues,
    }),
  };
}

/**
 * Translate a domain or AppError into the standard
 * `ActionFailure` envelope. The shape mirrors the
 * `accounts` helper at `_shared.ts` but carries the typed
 * error verbatim (no `appErrorToActionError` projection) —
 * the slice-3 actions catch both `AppError` and the
 * transaction-domain error hierarchy, and the Hono route
 * layer renders the union uniformly via the `code` getter
 * (`AppError.code` and `TransactionDomainError.domainCode`
 * are both reachable on the `error` field).
 *
 * Slice-3 deviation: the slice-1 design stamps
 * `code: 'VALIDATION_ERROR'` on every
 * `TransactionDomainError` (the inherited AppError code).
 * The wire surface, however, expects the typed
 * `domainCode` (`INVALID_AMOUNT`, `INVALID_DIRECTION`,
 * `FUTURE_TRANSACTION_DATE`). The action layer reads the
 * `domainCode` getter and surfaces it on the wire as the
 * `code` field — preserving the typed-error contract while
 * keeping the slice-1 `instanceof` test intact.
 *
 * The `DOMAIN_CODE_TO_WIRE` table maps the slice-1 domain
 * codes to their slice-2 wire counterparts. The shared
 * `ErrorCode` enum adopted `INVALID_AMOUNT` and
 * `FUTURE_DATE_NOT_ALLOWED`; `INVALID_DIRECTION` collapses
 * into `VALIDATION_ERROR` per the slice-2 spec (TRANSFER
 * is rejected as a validation failure, not a distinct wire
 * code). Adding a new domain code requires updating this
 * table — a `tsc` exhaustive-check would be the next
 * follow-up (typed by hand today to avoid widening the
 * `TransactionDomainError.domainCode` string union).
 */
const DOMAIN_CODE_TO_WIRE: Readonly<
  Record<string, 'INVALID_AMOUNT' | 'FUTURE_DATE_NOT_ALLOWED' | 'VALIDATION_ERROR'>
> = {
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  FUTURE_TRANSACTION_DATE: 'FUTURE_DATE_NOT_ALLOWED',
  INVALID_DIRECTION: 'VALIDATION_ERROR',
};

export function domainErrorToActionError(err: AppError | TransactionDomainError): ActionFailure {
  if (err instanceof TransactionDomainError) {
    const wireCode = DOMAIN_CODE_TO_WIRE[err.domainCode] ?? 'VALIDATION_ERROR';
    return {
      ok: false,
      error: new AppError({
        code: wireCode,
        message: err.message,
        details: err.details,
      }),
    };
  }
  return { ok: false, error: err };
}

/**
 * Wraps an unknown error as `AppError(FX_UNAVAILABLE)`. The
 * only 503 path in the transactions capability is the FX
 * provider throwing — the helper centralises that
 * projection. Domain / `AppError` errors are caught by the
 * `instanceof AppError` check in the action's catch block
 * before this helper is reached.
 *
 * Why the name: the slice-3 binding pinned the public name
 * `mapDomainError`. The body has a single, narrower job —
 * "wrap unknown errors as FX_UNAVAILABLE". A future rename
 * to `unknownErrorToFxUnavailable` is a slice-4 follow-up.
 */
export function mapDomainError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError({
    code: 'FX_UNAVAILABLE',
    message: err instanceof Error ? err.message : 'FX provider failed.',
  });
}

/**
 * Helper: load the parent FinancialAccount for the
 * BR-TX-5 archived pre-check. Returns the row or `null` on
 * cross-user / miss. The action layer turns `null` into
 * `AppError(NOT_FOUND)`.
 */
export async function loadParentAccount(
  accountRepository: AccountRepositoryPort,
  userId: string,
  accountId: string,
): Promise<FinancialAccount | null> {
  return accountRepository.findById(userId, accountId);
}

/**
 * Helper: check whether the parent account is archived
 * (BR-TX-5). Returns `null` when the parent is live
 * (continue); returns an `AppError(ACCOUNT_ARCHIVED)` when
 * it is archived (the action maps this to 409).
 */
export function checkAccountArchived(account: FinancialAccount): AppError | null {
  if (account.archivedAt !== null) {
    return new AppError({
      code: 'ACCOUNT_ARCHIVED',
      message: 'Account is archived; cannot record transactions against it.',
    });
  }
  return null;
}

/**
 * Helper: recompute the FX snapshot via the slice-2
 * `convertAndSnapshot` helper when `amountMinor` or
 * `originalCurrency` changed. The action layer calls this
 * only in the update path; the create path delegates the
 * FX call to the slice-2 factory.
 *
 * The casa resolution is the caller's responsibility
 * (BR-FX-3); the helper here accepts the resolved
 * `casaSnapshot` and forwards. The native=casa skip path
 * is handled inside `convertAndSnapshot` (it short-circuits
 * when native === casa's currency); the action passes the
 * snapshot back to the repository.
 */
export interface RecomputeFxInput {
  readonly originalAmountMinor: number;
  readonly originalCurrency: 'ARS' | 'USD' | 'EUR';
  readonly casaSnapshot: AccountFxCasa;
  readonly fxRateProvider: FxRateProvider;
  readonly now: Date;
}
export async function recomputeFxSnapshot(input: RecomputeFxInput): Promise<{
  convertedAmountMinor: number;
  convertedCurrency: 'ARS' | 'USD' | 'EUR';
  fxAsOfSnapshot: Date | null;
  casa: AccountFxCasa;
}> {
  const result = await convertAndSnapshot({
    originalAmountMinor: input.originalAmountMinor,
    originalCurrency: input.originalCurrency,
    casa: input.casaSnapshot,
    fxRateProvider: input.fxRateProvider,
    now: input.now,
  });
  return {
    convertedAmountMinor: result.convertedAmountMinor,
    convertedCurrency: result.convertedCurrency,
    fxAsOfSnapshot: result.fxAsOfSnapshot,
    casa: result.casa,
  };
}
