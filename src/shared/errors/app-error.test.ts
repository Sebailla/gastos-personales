import { describe, it, expect } from 'vitest';
import { AppError } from './app-error';
import { ErrorCode } from './error-codes';

describe('AppError', () => {
  it('stores the code, statusCode, and details', () => {
    const err = new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'invalid input',
      details: { field: 'email' },
    });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: 'email' });
  });

  it('is an instance of Error', () => {
    const err = new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'boom',
    });
    expect(err).toBeInstanceOf(Error);
  });

  it('sets the name to "AppError"', () => {
    const err = new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'boom',
    });
    expect(err.name).toBe('AppError');
  });

  it('maps every ErrorCode to a documented HTTP status', () => {
    const expectations: Record<ErrorCode, number> = {
      VALIDATION_ERROR: 400,
      WEAK_PASSWORD: 400,
      INVALID_CREDENTIALS: 401,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      EMAIL_TAKEN: 409,
      NAME_TAKEN: 409,
      NOT_FOUND: 404,
      FX_UNAVAILABLE: 503,
      FX_NOT_SUPPORTED: 409,
      RATE_LIMITED: 429,
      OAUTH_PROVIDER_UNAVAILABLE: 502,
      INTERNAL_ERROR: 500,
    };
    for (const [code, status] of Object.entries(expectations)) {
      const err = new AppError({ code: code as ErrorCode, message: 'x' });
      expect(err.statusCode).toBe(status);
    }
  });
});
