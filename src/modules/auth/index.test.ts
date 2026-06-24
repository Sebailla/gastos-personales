// Module-resolution workaround (DELTA-C1.1 of auth-foundation-slice-c,
// issue #18): this test would normally import from './index' (which
// transitively imports next-auth → 'next/server' bare import).
// Instead, this test reads the file as text and checks for the
// documented public-API exports. This is a static check, not a
// runtime check - it verifies that the contract is declared in the
// file, not that the imports resolve at runtime.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(here, 'index.ts'), 'utf-8');
const nextauthExists = existsSync(resolve(here, 'nextauth.ts'));

describe('auth module public API (static check)', () => {
  it('main barrel declares the documented non-next-auth surface', () => {
    // The main barrel MUST NOT pull the next-auth chain
    // (issue #18). The next-auth symbols live in the
    // `./nextauth` sub-barrel; the main barrel only
    // exposes the Hono route mount function and the
    // event-name constants.
    expect(indexSource).toMatch(/export\s*\{[^}]*\bUserRegistered\b[^}]*\}/);
    expect(indexSource).toMatch(/export\s*\{[^}]*\bUserSignedIn\b[^}]*\}/);
    expect(indexSource).toMatch(/export\s*\{[^}]*\bmountAuthRoutes\b[^}]*\}/);
    // The main barrel MUST NOT re-export the next-auth
    // chain (it lives in the `./nextauth` sub-barrel).
    expect(indexSource).not.toMatch(/export\s*\{[^}]*\bauth\b[^}]*\}/);
    expect(indexSource).not.toMatch(/export\s*\{[^}]*\bsignIn\b[^}]*\}/);
    expect(indexSource).not.toMatch(/export\s*\{[^}]*\bsignOut\b[^}]*\}/);
    expect(indexSource).not.toMatch(/export\s*\{[^}]*\bhandlers\b[^}]*\}/);
  });

  it('nextauth sub-barrel exists and exposes the next-auth chain', () => {
    // The next-auth chain is split out of the main barrel
    // to keep the Hono app's import graph clean (issue
    // #18). Consumers that need auth() (Server
    // Components, the Auth.js catch-all) import from
    // '@/modules/auth/nextauth'.
    expect(nextauthExists).toBe(true);
    const nextauthSource = readFileSync(resolve(here, 'nextauth.ts'), 'utf-8');
    expect(nextauthSource).toMatch(/export\s*\{[^}]*\bauth\b[^}]*\}/);
    expect(nextauthSource).toMatch(/export\s*\{[^}]*\bsignIn\b[^}]*\}/);
    expect(nextauthSource).toMatch(/export\s*\{[^}]*\bsignOut\b[^}]*\}/);
    expect(nextauthSource).toMatch(/export\s*\{[^}]*\bhandlers\b[^}]*\}/);
  });
});
