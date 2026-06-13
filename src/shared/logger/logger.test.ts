import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, denylistKeys } from './logger';

describe('logger', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it.each([
    'password',
    'passwordHash',
    'sessionToken',
    'access_token',
    'refresh_token',
    'id_token',
    'csrfToken',
    'set-cookie',
    'authorization',
    'cookie',
    'code',
  ])('redacts the "%s" key from log payloads', (key) => {
    logger.info('test', { [key]: 'super-secret-value', userId: 'u1' });

    const line = JSON.parse((infoSpy.mock.calls[0]?.[0] as string) ?? '{}');
    expect(line[key]).toBe('[REDACTED]');
    expect(line.userId).toBe('u1');
  });

  it('redacts nested sensitive keys', () => {
    logger.info('test', { request: { headers: { cookie: 'sid=abc' }, body: { id: 1 } } });

    const line = JSON.parse((infoSpy.mock.calls[0]?.[0] as string) ?? '{}');
    expect(line.request.headers.cookie).toBe('[REDACTED]');
    expect(line.request.body.id).toBe(1);
  });

  it('does not include the secret value in any string fragment', () => {
    const secret = 'super-secret-32-bytes-min-padding-AAAA';
    logger.info('test', { password: secret });

    const written = infoSpy.mock.calls[0]?.[0] as string;
    expect(written).not.toContain(secret);
  });

  it('attaches the requestId to every line', () => {
    logger.info('test', { requestId: 'req-123', userId: 'u1' });
    const line = JSON.parse((infoSpy.mock.calls[0]?.[0] as string) ?? '{}');
    expect(line.requestId).toBe('req-123');
  });

  it('exports the canonical denylist', () => {
    expect(denylistKeys).toContain('password');
    expect(denylistKeys).toContain('passwordHash');
    expect(denylistKeys).toContain('sessionToken');
  });
});
