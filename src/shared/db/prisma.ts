/**
 * Singleton wrapper around the Prisma client.
 *
 * The repository implementations (T-016, T-017) call
 * `prisma()` to obtain the live client. The test suite can
 * substitute a fake with `setPrismaClient` so the unit
 * tests for the auth domain don't need a real database.
 *
 * In production the client is built lazily on first access
 * (no top-level `new PrismaClient()`), so cold-start cost
 * is paid only when something actually queries.
 */

import { PrismaClient } from '@prisma/client';

let instance: PrismaClient | undefined;

export function prisma(): PrismaClient {
  if (!instance) {
    instance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return instance;
}

/**
 * Connection-pool sizing guidance (4R-R4 C-2).
 *
 * Prisma 6 reads pool sizing from the connection URL's query
 * string: append `?connection_limit=N&pool_timeout=S` to
 * `DATABASE_URL`. The Prisma default of
 * `num_physical_cpus * 2 + 1` is 3 on Fly's shared-cpu-1x (1
 * vCPU), which is exhausted by:
 *
 *   - Argon2id (sync NAPI, ~50-100 ms per sign-in attempt)
 *   - the /api/readyz probe (SELECT 1 every Fly probe
 *     interval)
 *   - the session lookup on every App Router page render
 *     (auth() in proxy.ts -> Session table)
 *
 * Recommended for shared-cpu-1x prod: `connection_limit=10`
 * and `pool_timeout=10` (seconds). For dedicated-cpu-1x or
 * larger: `connection_limit=20` is a safe upper bound.
 *
 * The default Prisma value is fine for local dev and CI; the
 * Fly release command is responsible for setting the prod
 * URL via the secrets store.
 */

export function setPrismaClient(client: PrismaClient): void {
  instance = client;
}

export function __resetPrismaForTests(): void {
  instance = undefined;
}
