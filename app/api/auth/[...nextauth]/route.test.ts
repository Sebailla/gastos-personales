/**
 * Auth.js route handler test.
 *
 * EXCLUDED FROM vitest. The import chain
 *   ./route.ts -> @/modules/auth -> authjs.ts -> next-auth
 *   -> next/server
 * trips the next-auth@5.0.0-beta.25 + next@15.1.0
 * module-resolution bug documented in
 *   openspec/changes/auth-foundation/apply-progress.md
 *   (deviation #4).
 *
 * The test file is kept so the test case is not lost;
 * Slice C resolves the upstream issue (bump next to 15.2+
 * or pin an earlier next-auth beta) and re-includes this
 * test in `vitest.config.ts`.
 *
 * The route handler is validated by `pnpm run build` (which
 * runs Next.js's static analysis on the route file) and by
 * runtime smoke: navigating to `/api/auth/signin` returns
 * the Auth.js HTML response.
 */

import { describe, it, expect } from 'vitest';
import { handlers } from '@/modules/auth';

describe('Auth.js route handler mount', () => {
  it('exports a GET and POST handler with the Next.js route-handler shape', () => {
    expect(handlers).toBeDefined();
    expect(typeof handlers.GET).toBe('function');
    expect(typeof handlers.POST).toBe('function');
  });
});
