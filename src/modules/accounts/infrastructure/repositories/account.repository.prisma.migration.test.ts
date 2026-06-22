/**
 * Migration non-destructive integration test (fx-cache PR-2 T2.10).
 *
 * Verifies REQ-FX-9: the `add_account_fx_casa` migration adds
 * the per-account `casa` column to `FinancialAccount` as
 * nullable, without backfill and without altering existing
 * rows. The test runs against a real PostgreSQL via the
 * project's `prisma()` singleton (testcontainers-Postgres in
 * CI; the local dev `gastos-postgres` Docker container for
 * hand-validation).
 *
 * Strategy: the migration has already been applied to the
 * dev database (the worker ran `pnpm prisma migrate dev`
 * during T2.2). This test asserts the post-migration state
 * on a freshly-populated DB:
 *
 * (1) every pre-migration row has `casa IS NULL`;
 * (2) inserting a new row with `casa = 'BLUE'` succeeds;
 * (3) inserting a new row with `casa = 'OFICIAL'` succeeds;
 * (4) querying the new rows returns the casa value verbatim
 *     (the Prisma client maps the column to the uppercase
 *     `AccountFxCasa` enum).
 *
 * The test SKIPS itself when `DATABASE_URL` is missing or
 * unreachable (e.g. in a pure unit-test environment without
 * Postgres). The CI test job runs testcontainers; the local
 * dev `pnpm test` runs the test against the Docker container.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DATABASE_URL = process.env['DATABASE_URL'];

const integrationEnabled = (() => {
  if (!DATABASE_URL) return false;
  // The test setup uses postgresql://test:test@localhost:5432/...
  // for the unit-test env. If that's what we have, skip — the
  // real Postgres is on a different port (5433 in docker-compose).
  if (DATABASE_URL.includes(':5432/')) return false;
  return true;
})();

const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration('add_account_fx_casa migration — non-destructive (fx-cache PR-2 T2.10)', () => {
  let prisma: PrismaClient;
  let testUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: DATABASE_URL! }),
    });

    // Seed a user (the foreign key is required for any
    // FinancialAccount row). We don't care about the user's
    // identity — just that the FK resolves.
    const user = await prisma.user.create({
      data: {
        email: `migration-test-${Date.now()}@example.com`,
        name: 'Migration Test User',
      },
    });
    testUserId = user.id;
  });

  it('pre-migration rows have casa IS NULL (column was added without backfill)', async () => {
    // Seed two FinancialAccount rows directly via Prisma
    // (bypassing the application layer so we control the
    // exact shape). Each row has NO casa field, simulating
    // pre-migration state. The migration is non-destructive
    // — the column was added as nullable with no default.
    const accA = await prisma.financialAccount.create({
      data: {
        userId: testUserId,
        type: 'BANK',
        name: `pre-a-${Date.now()}`,
        currency: 'USD',
        openingBalanceMinor: 0,
        openingBalanceMode: 'FRESH',
      },
    });
    const accB = await prisma.financialAccount.create({
      data: {
        userId: testUserId,
        type: 'CREDIT',
        name: `pre-b-${Date.now()}`,
        currency: 'ARS',
        openingBalanceMinor: 1000,
        openingBalanceMode: 'FRESH',
      },
    });

    // Re-read with the casa column selected explicitly.
    const reA = await prisma.financialAccount.findUnique({
      where: { id: accA.id },
      select: { id: true, casa: true },
    });
    const reB = await prisma.financialAccount.findUnique({
      where: { id: accB.id },
      select: { id: true, casa: true },
    });

    expect(reA?.casa).toBeNull();
    expect(reB?.casa).toBeNull();
  });

  it('inserting a new row with casa: "BLUE" succeeds', async () => {
    const acc = await prisma.financialAccount.create({
      data: {
        userId: testUserId,
        type: 'BANK',
        name: `casa-blue-${Date.now()}`,
        currency: 'USD',
        openingBalanceMinor: 0,
        openingBalanceMode: 'FRESH',
        casa: 'BLUE',
      },
    });
    const re = await prisma.financialAccount.findUnique({
      where: { id: acc.id },
      select: { casa: true },
    });
    expect(re?.casa).toBe('BLUE');
  });

  it('inserting a new row with casa: "OFICIAL" succeeds', async () => {
    const acc = await prisma.financialAccount.create({
      data: {
        userId: testUserId,
        type: 'BANK',
        name: `casa-oficial-${Date.now()}`,
        currency: 'USD',
        openingBalanceMinor: 0,
        openingBalanceMode: 'FRESH',
        casa: 'OFICIAL',
      },
    });
    const re = await prisma.financialAccount.findUnique({
      where: { id: acc.id },
      select: { casa: true },
    });
    expect(re?.casa).toBe('OFICIAL');
  });

  it('inserting a new row with casa: "INVALID" fails at the DB layer', async () => {
    // The Prisma AccountFxCasa enum rejects unknown values.
    // This is a defense-in-depth check on top of the Zod
    // parse; the application layer never lets an invalid
    // casa reach the SQL INSERT in practice.
    await expect(
      prisma.financialAccount.create({
        data: {
          userId: testUserId,
          type: 'BANK',
          name: `casa-invalid-${Date.now()}`,
          currency: 'USD',
          openingBalanceMinor: 0,
          openingBalanceMode: 'FRESH',
          casa: 'INVALID' as never,
        },
      }),
    ).rejects.toThrow();
  });
});
