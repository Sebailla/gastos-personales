/**
 * Shared types and helpers for the 3 reports actions.
 *
 * Slice 2 deliverable — local copy of the action-layer envelope.
 * The reports module does NOT import
 * `@/modules/transactions/application/actions/_shared.ts` —
 * modules-isolated rule (root `AGENTS.md` §10.5; design §5.1).
 *
 * Exports:
 * - `ActionResult<T> = ActionSuccess<T> | ActionFailure`
 *   — discriminated union (`ok: true | false`).
 * - `ReportsActionDeps` — the deps bag (see below).
 * - `zodErrorToActionError(err: ZodError): ActionFailure` —
 *   uniform 400 envelope for Zod failures.
 * - `domainErrorToActionError(err): ActionFailure` — maps
 *   `ReportsDomainError` codes to wire codes per design §5.7.
 *
 * Error mapping table (design §5.7):
 *
 *   | Domain code           | Wire code         | HTTP |
 *   | --------------------- | ----------------- | ---- |
 *   | `INVALID_MONTH`       | `VALIDATION_ERROR`| 400  |
 *   | `INVALID_ACCOUNT_ID`  | `VALIDATION_ERROR`| 400  |
 *   | `INVALID_DATE_RANGE`  | `VALIDATION_ERROR`| 400  |
 *   | `ACCOUNT_NOT_FOUND`   | `NOT_FOUND`       | 404  |
 *
 * Cross-cutting invariants (carried from design §5.1):
 * - The reports module never imports from the transactions
 *   module at the deep path; the local copy is the price.
 * - The `dispatcher` field is held for symmetry with the
 *   transactions deps bag and as a forward-compatibility
 *   seat (a future materializer would dispatch
 *   `ReportSnapshotRefreshed` events). v1 actions do not call it.
 */

import type { ZodError } from 'zod';
import type {
  AccountRepositoryPort,
  AccountCurrency,
  TransactionDTO,
} from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import type { logger as LoggerSingleton } from '@/shared/logger/logger';
import type { EventDispatcher } from '@/shared/events/event-dispatcher';
import type {
  ReportsRepositoryPort,
} from '../../domain/ports/reports-repository.port';
import type {
  ReportSubscriberPort,
} from '../../domain/ports/report-subscriber.port';
import { ReportsDomainError } from '../../domain/errors/reports-domain-error';
import { AppError } from '@/shared/errors/app-error';

/**
 * Logger shape consumed by the action layer (mirrors the
 * `logger` singleton exported from `@/shared/logger/logger`).
 * The slice-2 binding pins this type here because the shared
 * module exposes only the singleton. The action layer types
 * its deps as the structural shape (debug / info / warn /
 * error) so test fixtures can pass partial mocks.
 */
export type Logger = typeof LoggerSingleton;

/**
 * Re-export the structural types the actions consume. The
 * `import type` form keeps these out of the runtime bundle
 * (root AGENTS.md §10.5: no `any`; explicit types only).
 */
export type {
  AccountRepositoryPort,
  AccountCurrency,
  TransactionDTO,
  ReportsRepositoryPort,
  ReportSubscriberPort,
  Clock,
  EventDispatcher,
};

/**
 * The action-layer dependency bag. Constructed at the
 * composition root and passed unchanged to every action.
 *
 * - `reportsRepository`: read-only data source for the
 *   aggregates (implements `ReportsRepositoryPort`).
 * - `accountRepository`: cross-user guard for the flow
 *   endpoint (REQ-RPT-4). Used only by `getAccountFlowAction`.
 * - `subscriber`: the no-op seam for the future materializer
 *   (REQ-RPT-7). v1 actions do not call it; the field is
 *   held for symmetry and forward compatibility.
 * - `clock`: time abstraction (`Clock.now()` for `generatedAt`).
 * - `logger`: structured logger.
 * - `dispatcher`: process-wide event dispatcher; held for
 *   symmetry with `TransactionActionDeps` (a future materializer
 *   would dispatch `ReportSnapshotRefreshed`). v1 actions do
 *   not call it.
 */
export interface ReportsActionDeps {
  readonly reportsRepository: ReportsRepositoryPort;
  readonly accountRepository: AccountRepositoryPort;
  readonly subscriber: ReportSubscriberPort;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly dispatcher: EventDispatcher;
}

/**
 * The action result envelope. Success carries `value`;
 * failure carries `error` (which is the typed error surfaced
 * from the action's catch block — usually an `AppError` with
 * the wire code, or a `ReportsDomainError` whose `domainCode`
 * maps to the wire code via `domainErrorToActionError`).
 */
export type ActionSuccess<T> = { readonly ok: true; readonly value: T };
export type ActionFailure = {
  readonly ok: false;
  readonly error: AppError | ReportsDomainError;
};
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

/**
 * Translate a ZodError to the standard 400 envelope. The
 * `error` is an `AppError(VALIDATION_ERROR)` carrying the
 * issues list as `details` so the UI can surface the first
 * message via BR-TX-8 / the standard accounts-list pattern.
 */
export function zodErrorToActionError(err: ZodError): ActionFailure {
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
 * Translate a domain error into the standard `ActionFailure`
 * envelope. The mapping mirrors the design §5.7 table:
 *
 * - `INVALID_MONTH`, `INVALID_ACCOUNT_ID`, `INVALID_DATE_RANGE`
 *   → `VALIDATION_ERROR` (400).
 * - `ACCOUNT_NOT_FOUND` → `NOT_FOUND` (404).
 * - Any unknown `domainCode` → `VALIDATION_ERROR` (defensive).
 *
 * The factory errors carry an `AppError.code` already (the
 * HTTP-mapped shared code); the function surfaces the
 * inherited `code` verbatim for the route layer's Hono
 * envelope. The wire surface preserves the `code` getter
 * (`AppError.code` is the HTTP-mapped `ErrorCode`).
 */
const DOMAIN_CODE_TO_WIRE: Readonly<
  Record<string, 'VALIDATION_ERROR' | 'NOT_FOUND'>
> = {
  INVALID_MONTH: 'VALIDATION_ERROR',
  INVALID_ACCOUNT_ID: 'VALIDATION_ERROR',
  INVALID_DATE_RANGE: 'VALIDATION_ERROR',
  ACCOUNT_NOT_FOUND: 'NOT_FOUND',
};

export function domainErrorToActionError(
  err: AppError | ReportsDomainError,
): ActionFailure {
  if (err instanceof ReportsDomainError) {
    const wireCode = DOMAIN_CODE_TO_WIRE[err.domainCode] ?? 'VALIDATION_ERROR';
    return {
      ok: false,
      error: new AppError({
        code: wireCode,
        message: err.message,
        details: (err as { details?: unknown }).details,
      }),
    };
  }
  return { ok: false, error: err };
}
