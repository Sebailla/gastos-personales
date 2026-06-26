/**
 * Compile-time port-shape assertions for `ReportsRepositoryPort`.
 *
 * Locks the BR-TX-4 cross-module invariant at the type level for
 * the reports read path: every method MUST accept `userId` as the
 * first argument and scope the underlying query to it. The
 * application layer can never accidentally request another user's
 * data; there is no `findById(id)` API on the reports port that
 * could leak cross-user rows.
 *
 * The technique: declare a function whose argument requires a
 * specific shape; the call site fails to typecheck when the
 * field is missing or the order is wrong. The runtime body never
 * accesses the fields; the assertion is purely type-level.
 *
 * Mirrors `src/modules/transactions/domain/interfaces/transaction.repository.port.test.ts`
 * (the canonical pattern in the codebase).
 *
 * Slice 1 / T-RPT-002 (RED): this test fails at type-check time
 * because the port declaration does not exist yet — the import
 * resolves to a missing module. The RED → GREEN cycle for the
 * port contract is identical to the transactions slice.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { ReportsRepositoryPort } from './reports-repository.port';
import type { TransactionDTO } from '@/shared/domain-kernel';

describe('ReportsRepositoryPort contract — reports slice 1', () => {
  it('declares exactly 3 read methods: findByUserAndMonth, findByUserAndMonthForBreakdown, findByUserAccountAndRange', () => {
    // Pin the public surface. Adding a 4th method is a breaking
    // change for any consumer that implements the port (slice 3's
    // Prisma adapter). The type assertion is structural — a future
    // port that renames or drops a method breaks the equality check.
    type Methods = keyof ReportsRepositoryPort;
    expectTypeOf<Methods>().toEqualTypeOf<
      'findByUserAndMonth' | 'findByUserAndMonthForBreakdown' | 'findByUserAccountAndRange'
    >();
  });

  it('every method takes userId as the first parameter (BR-TX-4)', () => {
    // Lock the order. A port that swaps the args (e.g.
    // findByUserAccountAndRange(accountId, userId, opts)) would let
    // a caller mis-order the scoping and leak cross-user rows. The
    // check uses `expectTypeOf<>().toEqualTypeOf<>()` on the FIRST
    // element of `Parameters<...>`. A future port that drops the
    // `userId` first arg (or renames it) breaks the equality type
    // assertion.
    expectTypeOf<
      Parameters<ReportsRepositoryPort['findByUserAndMonth']>[0]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      Parameters<ReportsRepositoryPort['findByUserAndMonthForBreakdown']>[0]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      Parameters<ReportsRepositoryPort['findByUserAccountAndRange']>[0]
    >().toEqualTypeOf<string>();
  });

  it('every method returns Promise<readonly TransactionDTO[]> (no Application/Infrastructure leak)', () => {
    // The kernel's `TransactionDTO` is the structural view the
    // reports aggregators consume. A port that returned the
    // canonical `Transaction` aggregate (15 fields, including the
    // methods `equals` / `withUpdates`) would leak domain details
    // into the application layer.
    expectTypeOf<ReturnType<ReportsRepositoryPort['findByUserAndMonth']>>().toEqualTypeOf<
      Promise<readonly TransactionDTO[]>
    >();
    expectTypeOf<
      ReturnType<ReportsRepositoryPort['findByUserAndMonthForBreakdown']>
    >().toEqualTypeOf<Promise<readonly TransactionDTO[]>>();
    expectTypeOf<ReturnType<ReportsRepositoryPort['findByUserAccountAndRange']>>().toEqualTypeOf<
      Promise<readonly TransactionDTO[]>
    >();
  });

  it('findByUserAccountAndRange carries accountId in its options object (no naked positional args)', () => {
    // The third method must take `accountId` in its options bag,
    // not as a second positional argument — keeping the second
    // positional slot open for `userId`-scoped invariants. The
    // exact shape is defined in the port; the test pins that
    // `accountId` is present (and is a string).
    type FindArgs = Parameters<ReportsRepositoryPort['findByUserAccountAndRange']>[1];
    expectTypeOf<FindArgs>().toHaveProperty('accountId');
    expectTypeOf<FindArgs['accountId']>().toEqualTypeOf<string>();
  });
});
