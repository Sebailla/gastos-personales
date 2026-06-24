/**
 * Tests for requireSession middleware.
 *
 * 3 cases:
 * (1) session present -> next() is called
 * (2) session missing -> throws AppError(UNAUTHORIZED)
 * (3) session present with null user -> throws
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { requireSession } from './require-session';
import { ErrorCode } from '@/shared/errors/error-codes';
import { errorHandler } from '@/shared/http/error-handler';

function buildApp(getValue: () => unknown) {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('user' as never, getValue() as never);
    await next();
  });
  app.use('/protected', requireSession);
  app.get('/protected', (c) => c.json({ ok: true }));
  return app;
}

describe('requireSession', () => {
  it('calls next() when a session user is on the context', async () => {
    const app = buildApp(() => ({ id: 'u-1', email: 'a@b.com' }));
    const res = await app.request('/protected');
    expect(res.status).toBe(200);
  });

  it('throws AppError(UNAUTHORIZED) when the user is missing', async () => {
    const app = buildApp(() => null);
    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('throws AppError(UNAUTHORIZED) when the user is undefined', async () => {
    const app = buildApp(() => undefined);
    const res = await app.request('/protected');
    expect(res.status).toBe(401);
  });

  // TRIANGULATE: handler downstream of requireSession is never reached when unauthorized.
  it('does not invoke the downstream handler when unauthorized', async () => {
    const handler = vi.fn(() => new Response('ok'));
    const app = new Hono();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('user' as never, null as never);
      await next();
    });
    app.use('/protected', requireSession);
    app.get('/protected', handler);
    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});
