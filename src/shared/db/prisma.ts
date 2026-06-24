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
 *
 * Prisma 7 requires an adapter for the `PrismaClient`
 * constructor (the legacy `url` in the schema is no longer
 * read at runtime). We use `@prisma/adapter-pg` (the
 * standard `pg`-driver adapter), which works with any
 * PostgreSQL-compatible endpoint: local Docker, Neon, RDS,
 * Supabase, etc.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let instance: PrismaClient | undefined;

export function prisma(): PrismaClient {
  if (!instance) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    instance = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return instance;
}

/**
 * Connection-pool sizing guidance (4R-R4 C-2).
 *
 * Prisma 7 reads pool sizing from the `pg.Pool` constructor
 * options passed to the `PrismaPg` adapter, NOT from the
 * connection URL's query string (which was the v6 way:
 * `?connection_limit=N&pool_timeout=S`). The default
 * `pg.Pool` size is 10 connections.
 *
 * Exhausted by on shared-cpu-1x (1 vCPU):
 *   - Argon2id (sync NAPI, ~50-100 ms per sign-in attempt)
 *   - the /api/readyz probe (SELECT 1 every Fly probe
 *     interval)
 *   - the session lookup on every App Router page render
 *     (auth() in proxy.ts -> Session table)
 *
 * Recommended for shared-cpu-1x prod: rely on the `pg`
 * default of 10 connections. For dedicated-cpu-1x or
 * larger: pass a `pg.Pool({ max: 20 })` to `PrismaPg`.
 * The Fly release command is responsible for setting the
 * prod URL via the secrets store.
 *
 * To override the default in dev (rare), construct the
 * adapter explicitly:
 *   import { Pool } from 'pg';
 *   const pool = new Pool({ connectionString: ..., max: 5 });
 *   const adapter = new PrismaPg(pool);
 */

export function setPrismaClient(client: PrismaClient): void {
  instance = client;
}

export function __resetPrismaForTests(): void {
  instance = undefined;
}
