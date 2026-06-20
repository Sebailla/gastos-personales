import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from './error-handler';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

const buildApp = () => {
  const app = new Hono();
  app.onError(errorHandler);
  return app;
};

describe('errorHandler', () => {
  it('formats AppError as { error: { code, message, details? } }', async () => {
    const app = buildApp();
    app.get('/boom', () => {
      throw new AppError({ code: ErrorCode.EMAIL_TAKEN, message: 'El email ya está registrado.' });
    });

    const res = await app.request('/boom');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('EMAIL_TAKEN');
    expect(body.error.message).toBe('El email ya está registrado.');
  });

  it('passes AppError.details through', async () => {
    const app = buildApp();
    app.get('/boom', () => {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid',
        details: { field: 'email' },
      });
    });

    const res = await app.request('/boom');
    const body = await res.json();
    expect(body.error.details).toEqual({ field: 'email' });
  });

  it('does not leak raw Error.message for unknown errors', async () => {
    const app = buildApp();
    app.get('/boom', () => {
      throw new Error('database password is hunter2');
    });

    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  // F-08: `cause` is logged (so the deployment is
  // observable) but never echoed in the response body
  // (would leak PII, stack frames, or upstream secrets).
  it('logs err.cause but does not include it in the response body', async () => {
    const app = buildApp();
    const innerError = new Error('upstream DB says: connection refused');
    app.get('/boom', () => {
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'DB probe failed.',
        cause: innerError,
      });
    });

    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('DB probe failed.');
    // `cause` is internal — it must NOT leak into the
    // response (would expose upstream secrets / stack
    // frames / PII).
    expect(JSON.stringify(body)).not.toContain('connection refused');
    expect(JSON.stringify(body)).not.toContain('upstream DB');
  });
});
