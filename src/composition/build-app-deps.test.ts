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
 *
 * Plus slice 3 (reports): the noop subscriber wiring
 * (REQ-RPT-7, BR-RPT-5). The dispatcher is process-wide;
 * capture the before count to assert `after === before + 1`.
 */

import { describe, it, expect } from 'vitest';
import { buildAppDeps, buildTransactionDeps } from '@/composition/build-app-deps';
import { TransactionRepositoryPrisma } from '@/modules/transactions/infrastructure/repositories/transaction.repository.prisma';
import { dispatcher } from '@/shared/events/event-dispatcher';

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

describe('buildAppDeps (slice 3 noop subscriber wiring)', () => {
  it('subscribes exactly one noop handler for TransactionRecorded (REQ-RPT-7, BR-RPT-5)', () => {
    // The dispatcher is process-wide; capture the before
    // count so a previous test that already wired the
    // subscriber does not affect the assertion.
    const before = dispatcher.subscriberCount('TransactionRecorded');
    buildAppDeps();
    const after = dispatcher.subscriberCount('TransactionRecorded');
    expect(after).toBe(before + 1);
  });
});
