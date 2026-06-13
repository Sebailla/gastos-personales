// Smoke test: ensures the Vitest config loads and the test
// environment boots. This is the only test in Phase 0 — it
// proves that the floor is solid before we layer the auth
// domain on top.
import { describe, it, expect } from 'vitest';

describe('scaffolding', () => {
  it('boots the Vitest environment', () => {
    expect(typeof process).toBe('object');
    expect(process.env.NODE_ENV).toBeDefined();
  });

  it('resolves the @/* path alias', async () => {
    // If the alias were broken, the import would throw.
    const { env } = await import('@/shared/env/env.schema');
    expect(env.AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});
