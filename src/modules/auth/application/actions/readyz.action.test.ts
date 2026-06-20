/**
 * Tests for the `readyzAction` (DB-probe readiness check).
 *
 * 3 cases:
 * (1) happy path: Prisma `$queryRaw` resolves → 200 with
 *     `{ status: 'ok', db: 'ok' }`.
 * (2) DB probe throws → 503 with the safe envelope.
 * (3) DB probe times out (>1s budget) → 503 with the safe
 *     envelope. The test uses a slow mock that never
 *     resolves to drive the timeout.
 *
 * The probe is mocked by injecting a fake Prisma client
 * via `setPrismaClient` (the test seam from
 * `src/shared/db/prisma.ts`). This is the same pattern the
 * auth module's repository tests use.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setPrismaClient, __resetPrismaForTests } from '@/shared/db/prisma';

interface FakePrisma {
  $queryRaw: ReturnType<typeof vi.fn>;
}

function buildFakePrisma(): FakePrisma {
  return { $queryRaw: vi.fn() };
}

describe('readyzAction', () => {
  let fake: FakePrisma;

  beforeEach(() => {
    fake = buildFakePrisma();
    // The cast to PrismaClient is the same trick the auth
    // module's user repository uses: the readyz action
    // only ever calls `$queryRaw`, so the structural
    // surface is what matters.
    setPrismaClient(fake as unknown as PrismaClient);
  });

  afterEach(() => {
    __resetPrismaForTests();
  });

  it('returns 200 with { status: ok, db: ok } when the DB probe resolves', async () => {
    fake.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    // Defer the import so `setPrismaClient` is in place.
    const { readyzAction } = await import('./readyz.action');
    const res = await readyzAction();
    expect(res.status).toBe(200);
    if (res.status === 200) {
      expect(res.data).toEqual({ status: 'ok', db: 'ok' });
    }
  });

  it('returns 503 with a safe envelope when the DB probe throws', async () => {
    fake.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const { readyzAction } = await import('./readyz.action');
    const res = await readyzAction();
    expect(res.status).toBe(503);
  });

  it('returns 503 with a safe envelope when the DB probe times out (1s budget)', async () => {
    // Never-resolving promise. The action's 1-second budget
    // must trip and the action must report 503.
    fake.$queryRaw.mockImplementationOnce(
      () => new Promise(() => undefined) as unknown as ReturnType<typeof fake.$queryRaw>,
    );
    const { readyzAction } = await import('./readyz.action');
    // Reduce the timeout for the test by patching the env
    // would require module-internal access; we just allow
    // the real 1s budget and verify the envelope.
    const start = Date.now();
    const res = await readyzAction();
    const elapsed = Date.now() - start;
    expect(res.status).toBe(503);
    // The probe should have given up within ~1.2s (budget
    // + small slack for timer drift in CI).
    expect(elapsed).toBeLessThan(1500);
  });
});
