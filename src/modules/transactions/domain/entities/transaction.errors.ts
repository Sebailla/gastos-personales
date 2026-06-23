/**
 * Domain errors: `transactions` capability.
 *
 * Slice 1 lock: the three domain errors live in the transactions
 * module rather than the shared `error-codes.ts` (which slice 1
 * does NOT touch — see slice 1 OUT OF SCOPE). The shared file is
 * reserved for the v1 wire codes; the module-local codes are the
 * internal invariant names the factory throws.
 *
 * Hierarchy:
 *   `TransactionDomainError`
 *     ├── `InvalidAmountError`     — BR-TX-1 (`amountMinor <= 0`).
 *     ├── `InvalidDirectionError`  — BR-TX-2 (`direction === TRANSFER` at write).
 *     └── `FutureTransactionDateError` — BR-TX-3 (`transactionDate > now`).
 *
 * All three extend `AppError` with the shared `VALIDATION_ERROR` code
 * (the only shared 400 available pre-slice-2). The action layer
 * surfaces the `code` getter (e.g. `INVALID_AMOUNT`) as a stable
 * string for the wire response; the mapping to the shared
 * `ErrorCode` enum (when slice 2 adds the three new codes) is a
 * future concern.
 *
 * `instanceof TransactionDomainError` is the catch-site test the
 * action layer uses to surface a uniform 400 without leaking
 * shared-codes knowledge.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

/**
 * Base class for every domain-level failure in the
 * `transactions` capability. Catches the action layer's
 * `instanceof` test without leaking shared-codes knowledge.
 */
export abstract class TransactionDomainError extends AppError {
  /** The domain-specific machine-readable code; the action layer
   *  forwards this on the wire (e.g. as `error.code`). Distinct
   *  from the inherited `AppError.code` (the HTTP-mapped shared
   *  `ErrorCode`). */
  public abstract readonly domainCode: string;

  protected constructor(message: string) {
    super({ code: ErrorCode.VALIDATION_ERROR, message });
  }
}

/** BR-TX-1: `amountMinor` must be strictly positive. */
export class InvalidAmountError extends TransactionDomainError {
  public readonly domainCode = 'INVALID_AMOUNT';
  constructor(message = 'Amount must be strictly positive.') {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

/** BR-TX-2: `direction` is one of `INCOME | EXPENSE` in v1. */
export class InvalidDirectionError extends TransactionDomainError {
  public readonly domainCode = 'INVALID_DIRECTION';
  constructor(message = 'TRANSFER is reserved for v1.1; rejected at the API in v1.') {
    super(message);
    this.name = 'InvalidDirectionError';
  }
}

/** BR-TX-3: `transactionDate` must not be in the future. */
export class FutureTransactionDateError extends TransactionDomainError {
  public readonly domainCode = 'FUTURE_TRANSACTION_DATE';
  constructor(message = 'transactionDate must not be in the future.') {
    super(message);
    this.name = 'FutureTransactionDateError';
  }
}
