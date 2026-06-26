/**
 * Domain errors: `reports` capability.
 *
 * Slice 1 lock: the five domain errors live in the reports
 * module rather than the shared `error-codes.ts` (which slice 1
 * does NOT touch — see slice 1 OUT OF SCOPE in
 * `openspec/changes/reports/tasks.md`). The shared file is
 * reserved for the v1 wire codes; the module-local codes are the
 * internal invariant names the factory throws.
 *
 * Hierarchy:
 *   `ReportsDomainError`
 *     ├── `InvalidMonthError`           — month regex or bounds violation.
 *     ├── `InvalidAccountIdError`       — accountId fails the cuid regex.
 *     ├── `InvalidDateRangeError`       — range > 366 days or from > to.
 *     └── `AccountNotFoundError`        — flow action's accountId does
 *                                          not belong to the caller.
 *
 * All four extend `AppError` with the existing shared codes
 * (`VALIDATION_ERROR` or `NOT_FOUND`). The action layer's
 * `domainErrorToActionError` (slice 2) maps these to the wire
 * codes; the factory itself never reaches the wire.
 *
 * `instanceof ReportsDomainError` is the catch-site test the
 * action layer uses to surface a uniform 400/404 without leaking
 * shared-codes knowledge.
 *
 * Cross-module invariants carried:
 * - BR-ACC-12: aggregates never call the FX provider in the read
 *   path; the snapshot columns on the `TransactionDTO` row are
 *   the totals source.
 * - BR-TX-4: every cross-module reference to a `Transaction` row
 *   scopes to `userId`; the factory trusts the port boundary.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

/**
 * Base class for every domain-level failure in the `reports`
 * capability. Catches the action layer's `instanceof` test
 * without leaking shared-codes knowledge. The `domainCode` is
 * the machine-readable string the application layer surfaces on
 * the wire (e.g. `INVALID_MONTH`); the inherited `AppError.code`
 * is the HTTP-mapped shared `ErrorCode` (e.g. `VALIDATION_ERROR`
 * mapped to 400).
 */
export abstract class ReportsDomainError extends AppError {
  /** The domain-specific machine-readable code; the action layer
   *  forwards this on the wire (e.g. as `error.code`). Distinct
   *  from the inherited `AppError.code` (the HTTP-mapped shared
   *  `ErrorCode`). */
  public abstract readonly domainCode: string;

  protected constructor(code: ErrorCode, message: string) {
    super({ code, message });
    this.name = 'ReportsDomainError';
  }
}
