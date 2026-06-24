/**
 * Tests for the slice-5 DI factory extension
 * (`buildTransactionDeps` in
 * `src/composition/build-app-deps.ts`).
 *
 * 3 cases:
 * (1) the factory returns an object with every field the
 *     `TransactionActionDeps` contract requires.
 * (2) `deps.repo` is a `TransactionRepositoryPrisma` - proves
 *     the Prisma adapter is wired at composition time (the
 *     slice-4 §10.5 refactor path).
 * (3) `deps.clock()` returns a `Date` - the slice-3 binding
 *     pins `clock: () => Date` (a function returning a
 *     Date), not the project's full `Clock` interface.
 */

import { describe, it, expect } from 'vitest';
import { buildTransactionDeps } from '@/composition/build-app-deps';
import { TransactionRepositoryPrisma } from '@/modules/transactions/infrastructure/repositories/transaction.repository.prisma';

describe('buildTransactionDeps (slice 5 DI factory extension)', () => {
  it('returns an object with every TransactionActionDeps field', () => {
    const deps = buildTransactionDeps();
    expect(deps.repo).toBeDefined();
    expect(deps.clock).toBeDefined();
    expect(typeof deps.clock).toBe('function');
    expect(deps.logger).toBeDefined();
    expect(deps.dispatcher).toBeDefined();
    expect(deps.fxRateProvider).toBeDefined();
  });

  it('deps.repo is a TransactionRepositoryPrisma instance', () => {
    const deps = buildTransactionDeps();
    expect(deps.repo).toBeInstanceOf(TransactionRepositoryPrisma);
  });

  it('deps.clock returns a Date', () => {
    const deps = buildTransactionDeps();
    expect(deps.clock()).toBeInstanceOf(Date);
  });
});
