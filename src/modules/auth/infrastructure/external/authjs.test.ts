import { describe, it, expect } from 'vitest';
import { authConfig, DUMMY_HASH } from './authjs';

describe('authConfig (Auth.js v5 wiring)', () => {
  it('uses database session strategy with 30-day maxAge', () => {
    expect(authConfig.session?.strategy).toBe('database');
    expect(authConfig.session?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(authConfig.session?.updateAge).toBe(24 * 60 * 60);
  });

  it('configures the Google and Credentials providers', () => {
    const ids = (authConfig.providers ?? []).map((p) => p.name);
    expect(ids).toContain('Google');
    expect(ids).toContain('Credentials');
  });

  it('points pages.signIn at /auth/signin', () => {
    expect(authConfig.pages?.signIn).toBe('/auth/signin');
    expect(authConfig.pages?.signOut).toBe('/auth/signout');
  });

  it('uses the AUTH_SECRET from the env schema', () => {
    expect(authConfig.secret).toBeDefined();
    expect((authConfig.secret ?? '').length).toBeGreaterThanOrEqual(32);
  });

  it('DUMMY_HASH is a Promise<string> resolving to an Argon2id encoded string', async () => {
    expect(DUMMY_HASH).toBeInstanceOf(Promise);
    const resolved = await DUMMY_HASH;
    expect(resolved).toMatch(/^\$argon2id\$/);
    expect(resolved.length).toBeGreaterThan(40);
  });

  it('DUMMY_HASH is generated once at module init (idempotent across imports)', async () => {
    const mod = await import('./authjs');
    const a = await DUMMY_HASH;
    const b = await mod.DUMMY_HASH;
    expect(a).toBe(b);
  });
});
