/**
 * Tests for the narrow Prisma delegate view and the
 * `asPrismaDelegateView` structural cast.
 *
 * The cast is the single point where the full
 * `PrismaClient` is narrowed to the surface the
 * repositories need. A wrong cast here lets unrelated
 * fields (`$transaction`, `$connect`, ...) leak into
 * the domain, and a too-narrow cast breaks the real
 * client. These tests pin the contract:
 *
 * 1. A structurally complete mock (with both `user` and
 *    `financialAccount` delegates) survives the cast and
 *    the returned methods are callable.
 * 2. An object missing a delegate field is rejected at
 *    compile time (we exercise the rejection via a
 *    `@ts-expect-error` so the test fails if the type
 *    checker ever stops catching the gap).
 * 3. The cast is structurally compatible with a wider
 *    object (the real `PrismaClient` has both delegates
 *    plus many more; the wider client also survives the
 *    cast because the cast is "downward").
 *
 * Style notes: AAA pattern, no logic in tests. The
 * `@ts-expect-error` is the one concession — it is a
 * compile-time check, not runtime logic.
 */

import { describe, it, expect } from 'vitest';
import { asPrismaDelegateView, type PrismaDelegateView } from './prisma-types';

describe('asPrismaDelegateView', () => {
  it('returns a structurally complete delegate view from a minimal mock', async () => {
    // Arrange: a minimal mock satisfies the shared
    // `PrismaUserDelegate` and `PrismaFinancialAccountDelegate`
    // contracts (the signatures are `any`-typed; we only need
    // callable functions with the right names).
    const mock: PrismaDelegateView = {
      user: {
        create: async () => ({ id: 'u-1' }),
        findUnique: async () => null,
        update: async () => ({ id: 'u-1' }),
      },
      financialAccount: {
        create: async () => ({ id: 'fa-1' }),
        findUnique: async () => null,
        findFirst: async () => null,
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
        count: async () => 0,
      },
    };

    // Act
    const view = asPrismaDelegateView(mock);

    // Assert: the returned object preserves the structural
    // shape — the methods are the same functions the mock
    // provided and are callable.
    expect(typeof view.user.create).toBe('function');
    expect(typeof view.user.findUnique).toBe('function');
    expect(typeof view.user.update).toBe('function');
    expect(typeof view.financialAccount.create).toBe('function');
    expect(typeof view.financialAccount.findUnique).toBe('function');
    expect(typeof view.financialAccount.findFirst).toBe('function');
    expect(typeof view.financialAccount.findMany).toBe('function');
    expect(typeof view.financialAccount.updateMany).toBe('function');
    expect(typeof view.financialAccount.count).toBe('function');

    const created = await view.user.create({ data: { email: 'a@b.c' } });
    expect(created).toEqual({ id: 'u-1' });

    const faList = await view.financialAccount.findMany({ where: { userId: 'u-1' } });
    expect(faList).toEqual([]);
  });

  it('rejects a structurally incomplete object at compile time', () => {
    // Compile-time check: an object that lacks the
    // `financialAccount` delegate must NOT be assignable
    // to the parameter type of `asPrismaDelegateView`.
    // If the type ever widens to accept this, the test
    // fails on `tsc --noEmit` and the @ts-expect-error
    // becomes an error of its own (caught at test time).
    const incomplete = {
      user: {
        create: async () => null,
        findUnique: async () => null,
        update: async () => null,
      },
      // `financialAccount` is missing on purpose.
    };

    // @ts-expect-error — `incomplete` is missing `financialAccount`.
    asPrismaDelegateView(incomplete);
  });

  it('accepts a wider object (the real PrismaClient is a structural superset)', () => {
    // The real `PrismaClient` has both delegates plus many
    // more (`$transaction`, `$connect`, `$disconnect`, ...).
    // The cast is "downward": a wider value is assignable
    // to the narrow view because every required field is
    // present.
    const widerClient = {
      $transaction: async () => undefined,
      $connect: async () => undefined,
      $disconnect: async () => undefined,
      user: {
        create: async () => ({ id: 'u-1' }),
        findUnique: async () => null,
        update: async () => ({ id: 'u-1' }),
      },
      financialAccount: {
        create: async () => ({ id: 'fa-1' }),
        findUnique: async () => null,
        findFirst: async () => null,
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
        count: async () => 0,
      },
    } as const;

    const view = asPrismaDelegateView(widerClient);

    // The narrow view still exposes only the two delegates
    // the repositories need. (The wider `$transaction` is
    // invisible to the type, but the runtime object is the
    // same reference — the cast is purely structural.)
    expect(typeof view.user.create).toBe('function');
    expect(typeof view.financialAccount.count).toBe('function');
  });
});
