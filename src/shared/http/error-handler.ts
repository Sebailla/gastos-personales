import type { ErrorHandler } from 'hono';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import { logger } from '@/shared/logger/logger';

/**
 * Central error handler. Every Hono route's thrown error flows
 * through here. The shape is the contract documented in the
 * `api-design` skill:
 *
 *   { error: { code, message, details? } }
 *
 * - `AppError`: passed through with `code`, `message`, `details`.
 * - Anything else: logged with full stack, surface becomes
 *   `{ code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' }`.
 *   The original error is never sent to the client.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = (c.get('requestId') as string | undefined) ?? 'no-request-id';

  if (err instanceof AppError) {
    logger.warn('app_error', {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
      details: err.details,
    });
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502,
    );
  }

  // Unknown error: log with full stack, surface a safe envelope.
  logger.error('unhandled_error', {
    requestId,
    errorName: err instanceof Error ? err.name : 'Unknown',
    errorMessage: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json(
    {
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Ocurrió un error inesperado.',
      },
    },
    500,
  );
};
