import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { originCheck } from './origin-check';
import { errorHandler } from '@/shared/http/error-handler';
import { ErrorCode } from '@/shared/errors/error-codes';

const buildApp = () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('/mutate', originCheck());
  app.post('/mutate', (c) => c.json({ ok: true }));
  return app;
};

describe('originCheck middleware', () => {
  it('allows a same-origin POST', async () => {
    const app = buildApp();
    const res = await app.request('/mutate', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(200);
  });

  it('allows a POST with no Origin header (e.g. same-origin browser navigation)', async () => {
    const app = buildApp();
    const res = await app.request('/mutate', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('blocks a cross-origin POST with 403 FORBIDDEN', async () => {
    const app = buildApp();
    const res = await app.request('/mutate', {
      method: 'POST',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('blocks a cross-origin POST when the Referer also indicates an evil origin', async () => {
    const app = buildApp();
    const res = await app.request('/mutate', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.com',
        referer: 'https://evil.example.com/some/page',
      },
    });
    expect(res.status).toBe(403);
  });
});
