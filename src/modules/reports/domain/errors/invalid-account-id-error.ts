/**
 * Domain error: `InvalidAccountIdError`.
 *
 * Thrown by the `AccountFlow` factory when `accountId` fails
 * the cuid regex `^c[a-z0-9]{20,32}$` (per the orchestrator
 * correction #1 in `openspec/changes/reports/design.md` §3.4.1
 * — the project uses cuid for `FinancialAccount.id`, not UUID
 * v4 as the spec text originally said). The action layer's Zod
 * parse is the primary gate; the factory is the secondary
 * (defense in depth).
 *
 * Wire mapping: `domainCode === 'INVALID_ACCOUNT_ID'` →
 * `VALIDATION_ERROR` (HTTP 400).
 */

import { ErrorCode } from '@/shared/errors/error-codes';
import { ReportsDomainError } from './reports-domain-error';

export class InvalidAccountIdError extends ReportsDomainError {
  public readonly domainCode = 'INVALID_ACCOUNT_ID';

  constructor(message = 'accountId must match the cuid regex (^c[a-z0-9]{20,32}$).') {
    super(ErrorCode.VALIDATION_ERROR, message);
    this.name = 'InvalidAccountIdError';
  }
}
