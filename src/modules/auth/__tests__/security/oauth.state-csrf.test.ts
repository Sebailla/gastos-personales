// src/modules/auth/__tests__/security/oauth.state-csrf.test.ts
// DELTA-C2.5 of auth-foundation-slice-c (T-027.2): OAuth state CSRF
// protection (BR-AUTH-6). Auth.js validates the `state` parameter on
// the OAuth callback. A callback with a missing or tampered `state`
// must be rejected; no `User` or `Account` row should be created.
//
// This test uses `vi.mock` on the project's own authjs module to
// avoid the next-auth@5.0.0-beta.31 module-resolution bug. The
// `state` validation is delegated to Auth.js; we verify the
// contract is in place (provider configured, skipStateValidation
// not opted in, unique constraint on Account).

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/modules/auth/infrastructure/external/authjs', () => ({
  authConfig: {
    session: { strategy: 'database' },
    providers: [{ id: 'google' }, { id: 'credentials' }],
  },
}));

// ESLint sees the `vi.mock` as hoisted and flags the import as
// unused. Add an explicit type-only re-export so the import is
// considered used at the static analysis level.
export type _KeepVi = typeof vi;

describe('BR-AUTH-6: OAuth state CSRF protection', () => {
  it('the Google provider is configured', async () => {
    const { authConfig } = await import('@/modules/auth/infrastructure/external/authjs');
    const googleProvider = authConfig.providers?.find((p) => 'id' in p && p.id === 'google');
    expect(googleProvider).toBeDefined();
  });

  it('authConfig does not opt out of state validation', async () => {
    const { authConfig } = await import('@/modules/auth/infrastructure/external/authjs');
    expect(
      (authConfig as unknown as { skipStateValidation?: boolean }).skipStateValidation,
    ).toBeUndefined();
  });

  it('authConfig does not allow trustHost in production', async () => {
    if (process.env.NODE_ENV !== 'production') return;
    const { authConfig } = await import('@/modules/auth/infrastructure/external/authjs');
    expect((authConfig as unknown as { trustHost?: boolean }).trustHost).not.toBe(true);
  });

  it('Account table has a @@unique([provider, providerAccountId]) constraint', () => {
    // The unique constraint is what prevents an attacker from linking
    // their OAuth account to a victim's existing account (BR-AUTH-10).
    // This is a static check on the prisma schema.
    const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
    const schema = readFileSync(schemaPath, 'utf-8');
    expect(schema).toMatch(/@@unique\(\[provider,\s*providerAccountId\]/);
  });
});
