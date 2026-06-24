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
 * `AccountRepositoryPort` and `FxRateProvider` types from
 * `@/modules/accounts` (the public barrel) and the
 * `AccountRepositoryPort` is the same port the `accounts`
 * service depends on. The application layer reads the
 * parent FinancialAccount through this port — never through
 * the `accounts` infrastructure — preserving the ports &
 * adapters invariant.
 */

import type { ZodError } from 'zod';
import type { AccountRepositoryPort, FxRateProvider } from '@/modules/accounts';
import type { EventDispatcher } from '@/shared/events/event-dispatcher';
import type { Logger } from '@/shared/logger/logger';
import { AppError } from '@/shared/errors/app-error';
import {
  FutureTransactionDateError,
  InvalidAmountError,
  InvalidDirectionError,
  TransactionDomainError,
} from '../../domain/entities/transaction.errors';
import { convertAndSnapshot } from '../../domain/services/fx-snapshot';
import type { AccountFxCasa } from '../../domain/entities/transaction';
import type { TransactionRepositoryPort } from '../../domain/interfaces/transaction.repository.port';
import type { FinancialAccount } from '@/modules/accounts';

export { InvalidAmountError, InvalidDirectionError, FutureTransactionDateError };

/**
 * The action-layer dependency bag. Constructed at the
 * composition root and passed unchanged to every action.
 *
 * `clock` is a function (not the project's `Clock` interface)
 * per the slice-3 binding; the slice-4 service layer adopts
 * the full `Clock` interface.
 */
export interface TransactionActionDeps {
  readonly repo: TransactionRepositoryPort;
  readonly accountRepository: AccountRepositoryPort;
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
 */
export function domainErrorToActionError(err: AppError | TransactionDomainError): ActionFailure {
  if (err instanceof TransactionDomainError) {
    // The domain code is the wire-stable identifier. The
    // `ErrorCode` union (slice-2 additions) covers the three
    // typed codes; if the domain hierarchy grows beyond that,
    // a follow-up slice extends the union.
    return {
      ok: false,
      error: new AppError({
        code: err.domainCode as
          | 'INVALID_AMOUNT'
          | 'INVALID_DIRECTION'
          | 'FUTURE_DATE_NOT_ALLOWED'
          | 'VALIDATION_ERROR',
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
  readonly originalCurrency: 'ARS' | 'USD';
  readonly casaSnapshot: AccountFxCasa;
  readonly fxRateProvider: FxRateProvider;
  readonly now: Date;
}
export async function recomputeFxSnapshot(input: RecomputeFxInput): Promise<{
  convertedAmountMinor: number;
  convertedCurrency: 'ARS' | 'USD';
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
