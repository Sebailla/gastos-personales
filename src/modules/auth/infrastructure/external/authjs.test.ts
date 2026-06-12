import { describe, it, expect } from 'vitest';
import { authConfig, DUMMY_HASH } from './authjs';

describe('authConfig (Auth.js v5 wiring)', () => {
  it('uses database session strategy with 30-day maxAge', () => {
    expect(authConfig.session?.strategy).toBe('database');
    expect(authConfig.session?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(authConfig.session?.updateAge).toBe(24 * 60 * 60);
  });

  it('configures the Google and Credentials providers', () => {
    const ids = (authConfig.providers ?? []).map((p) => p.id);
    expect(ids).toContain('google');
    expect(ids).toContain('credentials');
  });

  it('points pages.signIn at /auth/signin', () => {
    expect(authConfig.pages?.signIn).toBe('/auth/signin');
    expect(authConfig.pages?.signOut).toBe('/auth/signout');
  });

  it('uses the AUTH_SECRET from the env schema', () => {
    expect(authConfig.secret).toBeDefined();
    expect((authConfig.secret ?? '').length).toBeGreaterThanOrEqual(32);
  });

  it('DUMMY_HASH is a non-empty Argon2id encoded string', () => {
    expect(DUMMY_HASH).toMatch(/^\$argon2id\$/);
    expect(DUMMY_HASH.length).toBeGreaterThan(40);
  });

  it('DUMMY_HASH is generated once at module init (idempotent across imports)', async () => {
    const mod = await import('./authjs');
    expect(mod.DUMMY_HASH).toBe(DUMMY_HASH);
  });
});
