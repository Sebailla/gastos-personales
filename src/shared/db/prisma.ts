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

export function setPrismaClient(client: PrismaClient): void {
  instance = client;
}

export function __resetPrismaForTests(): void {
  instance = undefined;
}
