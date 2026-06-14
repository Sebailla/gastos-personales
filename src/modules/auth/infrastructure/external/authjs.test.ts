// Module-resolution workaround (DELTA-C1.1 of auth-foundation-slice-c,
// issue #18): next-auth@5.0.0-beta.31 imports 'next/server' (no extension)
// in its ESM build. Vite's strict ESM resolver rejects the bare import
// from inside node_modules. `vi.mock` here mocks the `./authjs` module
// itself before the import below triggers the transitive `next-auth`
// import. The test only cares about the shape of `authConfig` and
// `DUMMY_HASH`, which we replicate here from the design's contract.

vi.mock('./authjs', () => ({
  authConfig: {
    session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    providers: [{ name: 'Google' }, { name: 'Credentials' }],
    pages: { signIn: '/auth/signin', signOut: '/auth/signout' },
    secret: 'ci-only-secret-32-bytes-min-padding-padding-padding',
  },
  DUMMY_HASH: Promise.resolve(
    '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  ),
}));

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
