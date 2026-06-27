/**
 * Domain error: `InvalidMonthError`.
 *
 * Thrown by the `MonthlySummary` / `CategoryBreakdown` factories
 * when the `year` / `month` is out of bounds (month not in
 * `1..12`, or year outside `2000..2100`). The action layer's
 * Zod parse is the primary gate; the factory is the secondary
 * (defense in depth).
 *
 * Wire mapping: `domainCode === 'INVALID_MONTH'` →
 * `VALIDATION_ERROR` (HTTP 400). See `ReportsDomainError` for
 * the hierarchy rationale.
 */

import { ErrorCode } from '@/shared/errors/error-codes';
import { ReportsDomainError } from './reports-domain-error';

export class InvalidMonthError extends ReportsDomainError {
  public readonly domainCode = 'INVALID_MONTH';

  constructor(message = 'Month must be in 1..12 and year in 2000..2100.') {
    super(ErrorCode.VALIDATION_ERROR, message);
    this.name = 'InvalidMonthError';
  }
}
