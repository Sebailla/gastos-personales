import { describe, it, expect } from 'vitest';
import { AppError } from './app-error';
import { ErrorCode, ErrorStatus } from './error-codes';

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

  // Maps every ErrorCode to its documented HTTP status. The
  // exhaustiveness comes from `ErrorStatus` (the centralized
  // map at error-codes.ts) — the loop iterates the live map
  // rather than a hardcoded literal, so future code additions
  // are picked up automatically (no test churn for new codes).
  // The previous version used a `Record<ErrorCode, number>`
  // literal that broke compile-time every time a new code was
  // added; this version decouples the assertion from the
  // literal.
  it.each(Object.entries(ErrorStatus) as Array<[ErrorCode, number]>)(
    'maps ErrorCode %s → HTTP %i',
    (code, status) => {
      const err = new AppError({ code, message: 'x' });
      expect(err.statusCode).toBe(status);
    },
  );
});
