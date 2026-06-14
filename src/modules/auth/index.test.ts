// Module-resolution workaround (DELTA-C1.1 of auth-foundation-slice-c,
// issue #18): this test would normally import from './index' (which
// transitively imports next-auth → 'next/server' bare import).
// Instead, this test reads the file as text and checks for the
// documented public-API exports. This is a static check, not a
// runtime check — it verifies that the contract is declared in the
// file, not that the imports resolve at runtime.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(here, 'index.ts'), 'utf-8');

describe('auth module public API (static check)', () => {
  it('declares the documented public surface', () => {
    // The compile-time check: the named exports must appear in
    // the file. We don't import the module (which would trigger
    // the next-auth chain); we just check the source.
    expect(indexSource).toMatch(/export\s*\{[^}]*\bauth\b[^}]*\}/);
    expect(indexSource).toMatch(/export\s*\{[^}]*\bsignIn\b[^}]*\}/);
    expect(indexSource).toMatch(/export\s*\{[^}]*\bsignOut\b[^}]*\}/);
    expect(indexSource).toMatch(/export\s*\{[^}]*\bhandlers\b[^}]*\}/);
    expect(indexSource).toMatch(/export\s*\{[^}]*\bhonoApp\b[^}]*\}/);
    expect(indexSource).toMatch(/export\s*\{[^}]*\bUserRegistered\b[^}]*\}/);
    expect(indexSource).toMatch(/export\s*\{[^}]*\bUserSignedIn\b[^}]*\}/);
  });
});
