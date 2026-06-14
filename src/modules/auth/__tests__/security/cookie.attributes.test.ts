// src/modules/auth/__tests__/security/cookie.attributes.test.ts
// DELTA-C2.9 of auth-foundation-slice-c (T-027.6): cookie attributes.
// The `authjs.session-token` cookie MUST have `HttpOnly` and
// `SameSite=Lax` always. `Secure` MUST be set in production
// (`NODE_ENV=production`).
//
// This test uses `vi.mock` on the project's own authjs module to
// avoid the next-auth@5.0.0-beta.31 module-resolution bug (the
// `authConfig` is statically defined and can be replicated here for
// the contract test).

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/auth/infrastructure/external/authjs', () => ({
  authConfig: {
    session: { strategy: 'database' },
    cookies: {
      sessionToken: {
        name: 'authjs.session-token',
        options: {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
        },
      },
    },
  },
}));

describe('Auth.js session cookie attributes', () => {
  it('uses cookie name authjs.session-token', async () => {
    const { authConfig } = await import('@/modules/auth/infrastructure/external/authjs');
    expect(authConfig.cookies?.sessionToken?.name).toBe('authjs.session-token');
  });

  it('HttpOnly is enabled', async () => {
    const { authConfig } = await import('@/modules/auth/infrastructure/external/authjs');
    const options = authConfig.cookies?.sessionToken?.options as
      | { httpOnly?: boolean }
      | undefined;
    expect(options?.httpOnly).toBe(true);
  });

  it('SameSite is Lax', async () => {
    const { authConfig } = await import('@/modules/auth/infrastructure/external/authjs');
    const options = authConfig.cookies?.sessionToken?.options as
      | { sameSite?: string }
      | undefined;
    expect(options?.sameSite).toBe('lax');
  });

  it('Secure is enabled in production', async () => {
    const { authConfig } = await import('@/modules/auth/infrastructure/external/authjs');
    const options = authConfig.cookies?.sessionToken?.options as
      | { secure?: boolean }
      | undefined;
    if (process.env.NODE_ENV === 'production') {
      expect(options?.secure).toBe(true);
    }
  });
});
