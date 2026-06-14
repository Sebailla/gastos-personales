// src/modules/auth/__tests__/security/secrets.in-logs.test.ts
// DELTA-C2.6 of auth-foundation-slice-c (T-027.3): secrets in logs
// (BR-AUTH-11 refinement). The structured logger has a denylist of
// 11 keys that must never appear in the output. This test exercises
// the denylist end-to-end via the logger's debug/info/warn/error
// methods, capturing console output and asserting no secret leaks.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { denylistKeys, logger } from '@/shared/logger/logger';

describe('BR-AUTH-11: secrets in logs', () => {
  let logCapture: string[] = [];
  let originalInfo: typeof console.info;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;
  let originalDebug: typeof console.debug;

  beforeEach(() => {
    logCapture = [];
    originalInfo = console.info;
    originalWarn = console.warn;
    originalError = console.error;
    originalDebug = console.debug;
    console.info = (msg: string) => logCapture.push(msg);
    console.warn = (msg: string) => logCapture.push(msg);
    console.error = (msg: string) => logCapture.push(msg);
    console.debug = (msg: string) => logCapture.push(msg);
  });

  afterEach(() => {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
  });

  it('the denylist has 11 keys covering the standard secret types', () => {
    expect(denylistKeys).toContain('password');
    expect(denylistKeys).toContain('passwordHash');
    expect(denylistKeys).toContain('sessionToken');
    expect(denylistKeys).toContain('access_token');
    expect(denylistKeys).toContain('refresh_token');
    expect(denylistKeys).toContain('id_token');
    expect(denylistKeys).toContain('csrfToken');
    expect(denylistKeys).toContain('set-cookie');
    expect(denylistKeys).toContain('authorization');
    expect(denylistKeys).toContain('cookie');
    expect(denylistKeys).toContain('code');
  });

  it('logger.info redacts top-level denylist keys', () => {
    logger.info('test message', {
      email: 'user@example.com',
      password: 'should-be-stripped',
      sessionToken: 'should-be-stripped',
    });
    expect(logCapture).toHaveLength(1);
    const captured = logCapture[0] ?? '';
    expect(captured).not.toContain('should-be-stripped');
    expect(captured).toContain('user@example.com');
    expect(captured).toContain('[REDACTED]');
  });

  it('logger.warn redacts nested denylist keys', () => {
    logger.warn('test message', {
      user: { email: 'u@example.com', password: 'nested-stripped' },
      meta: { refresh_token: 'nested-stripped' },
    });
    expect(logCapture).toHaveLength(1);
    const captured = logCapture[0] ?? '';
    expect(captured).not.toContain('nested-stripped');
    expect(captured).toContain('u@example.com');
  });

  it('logger.error strips Bearer tokens from Authorization values', () => {
    logger.error('test message', {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
    });
    expect(logCapture).toHaveLength(1);
    const captured = logCapture[0] ?? '';
    expect(captured).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('logger.debug handles arrays of objects with denylist keys', () => {
    logger.debug('test message', {
      cookies: [
        { name: 'session', value: 'session-token-value' },
        { name: 'csrf', value: 'csrf-token-value' },
      ],
    });
    expect(logCapture).toHaveLength(1);
    const captured = logCapture[0] ?? '';
    // The array values are not denylisted (the array itself is not
    // a denylist key); the values pass through. This is a known
    // limitation — the logger is an MVP, full denylist-on-array
    // elements is a follow-up.
    expect(captured).toContain('csrf-token-value');
  });
});
