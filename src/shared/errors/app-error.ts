import { ErrorCode, ErrorStatus, type ErrorCode as ErrorCodeType } from './error-codes';

export interface AppErrorParams {
  code: ErrorCodeType;
  message: string;
  details?: unknown;
  cause?: unknown;
}

/**
 * Application-level error. Every layer below the action
 * boundary throws `AppError` for known, expected failure
 * modes. Unexpected failures are caught by the central
 * error handler and converted to `AppError(INTERNAL_ERROR)`.
 *
 * The `code` is the machine-readable string the UI matches on;
 * `message` is the human-facing Spanish string for the error;
 * `details` is the optional payload (Zod issue list, etc.).
 */
export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly statusCode: number;
  public readonly details: unknown;
  public readonly cause: unknown;

  constructor({ code, message, details, cause }: AppErrorParams) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ErrorStatus[code];
    this.details = details;
    this.cause = cause;
    // Maintain a clean prototype chain in transpiled targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
