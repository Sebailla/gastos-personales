// src/modules/auth/__tests__/security/origin-check.test.ts
// DELTA-C2.7 of auth-foundation-slice-c (T-027.4): origin-check
// middleware. POST /api/auth/register with a mismatched `Origin`
// header returns 403 FORBIDDEN. Same-origin POST is allowed.
//
// Note: env.APP_URL is parsed at module init. We use the value set
// in test/setup.ts (`http://localhost:3000`) rather than overriding
// APP_URL at runtime, because the env schema is parsed once.

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { originCheck } from '@/shared/http/origin-check';
import { errorHandler } from '@/shared/http/error-handler';

const ALLOWED_ORIGIN = process.env.APP_URL ?? 'http://localhost:3000';

describe('originCheck middleware', () => {
  it('returns 403 FORBIDDEN when Origin does not match APP_URL', async () => {
    const app = new Hono();
    app.use('*', originCheck());
    app.onError(errorHandler);
    app.post('/api/auth/register', (c) => c.json({ ok: true }));

    const res = await app.request(`${ALLOWED_ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('allows same-origin POST', async () => {
    const app = new Hono();
    app.use('*', originCheck());
    app.onError(errorHandler);
    app.post('/api/auth/register', (c) => c.json({ ok: true }));

    const res = await app.request(`${ALLOWED_ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
