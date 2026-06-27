/**
 * Domain error: `InvalidDateRangeError`.
 *
 * Thrown by the `AccountFlow` factory when the date range fails
 * the BR-RPT-3 invariants: `fromDate > toDate` OR
 * `toDate - fromDate > 366 days`. 366 days = one calendar year
 * + leap-day buffer (orchestrator correction #3). The action
 * layer's Zod parse checks `fromDate <= toDate`; the factory
 * checks the 366-day upper bound because Zod has no built-in
 * date-math primitive (design §5.5 step 2 + §5.6 last paragraph).
 *
 * Wire mapping: `domainCode === 'INVALID_DATE_RANGE'` →
 * `VALIDATION_ERROR` (HTTP 400).
 */

import { ErrorCode } from '@/shared/errors/error-codes';
import { ReportsDomainError } from './reports-domain-error';

export class InvalidDateRangeError extends ReportsDomainError {
  public readonly domainCode = 'INVALID_DATE_RANGE';

  constructor(
    message = 'Date range must satisfy fromDate <= toDate and toDate - fromDate <= 366 days.',
  ) {
    super(ErrorCode.VALIDATION_ERROR, message);
    this.name = 'InvalidDateRangeError';
  }
}
