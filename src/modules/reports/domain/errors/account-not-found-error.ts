/**
 * Domain error: `AccountNotFoundError`.
 *
 * Thrown by the `getAccountFlowAction` (slice 2) when
 * `AccountRepositoryPort.findById(userId, accountId)` returns
 * `null` (cross-user or unknown account). The factory itself
 * does NOT throw this — the action does, after the cross-check.
 * Included in slice 1 so the error class is available to the
 * action layer's `domainErrorToActionError` mapping (slice 2).
 *
 * Wire mapping: `domainCode === 'ACCOUNT_NOT_FOUND'` →
 * `NOT_FOUND` (HTTP 404). The 404 envelope is identical to a
 * non-existent resource response so the attacker cannot
 * distinguish "not yours" from "doesn't exist" (BR-RPT-4).
 */

import { ErrorCode } from '@/shared/errors/error-codes';
import { ReportsDomainError } from './reports-domain-error';

export class AccountNotFoundError extends ReportsDomainError {
  public readonly domainCode = 'ACCOUNT_NOT_FOUND';

  constructor(message = 'Account not found for the given user.') {
    super(ErrorCode.NOT_FOUND, message);
    this.name = 'AccountNotFoundError';
  }
}
