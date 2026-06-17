// Module-resolution workaround (DELTA-C1.1 of auth-foundation-slice-c,
// issue #18): this test would normally import from '@/modules/auth'
// (which transitively imports next-auth → 'next/server' bare import).
// Instead, this test reads the route file as text and checks for the
// documented Next.js route-handler exports. This is a static check,
// not a runtime check — it verifies that the contract is declared in
// the file, not that the imports resolve at runtime.
//
// Note: this file lives at `app/api/auth/[...nextauth]/route.ts`
// (the Auth.js catch-all, NOT the Hono catch-all at
// `app/api/[...path]/route.ts` — see T-025). The Auth.js route
// re-exports `handlers.GET` and `handlers.POST` from `@/modules/auth`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(resolve(here, 'route.ts'), 'utf-8');

describe('Auth.js route handler mount (static check)', () => {
  it('re-exports GET and POST handlers (rate-limited wrapper, R4 W2)', () => {
    // The route file wraps Auth.js handlers with a path-aware
    // rate-limit gate. The shape is:
    //   export const { GET, POST } = { GET: rateLimitedGET, POST: rateLimitedPOST };
    expect(routeSource).toMatch(/export\s+const\s*\{\s*GET\s*,\s*POST\s*\}/);
    expect(routeSource).toMatch(/rateLimitedGET/);
    expect(routeSource).toMatch(/rateLimitedPOST/);
    expect(routeSource).toMatch(/runtime\s*=\s*'nodejs'/);
  });
});
