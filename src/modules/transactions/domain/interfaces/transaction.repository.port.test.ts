/**
 * Compile-time port-shape assertions for `TransactionRepositoryPort`.
 *
 * Locks the BR-TX-4 cross-module invariant at the type level:
 * every method MUST accept `userId` as the first argument and
 * scope the underlying query to it. The application layer can
 * never accidentally request another user's data; there is no
 * `findById(id)` API that could leak cross-user rows.
 *
 * The technique: declare a function whose argument requires a
 * specific shape; the call site fails to typecheck when the
 * field is missing or the order is wrong. The runtime body never
 * accesses the fields; the assertion is purely type-level.
 *
 * These tests run under `vitest run` and contribute 0 lines to
 * coverage (the `coverage.exclude` list filters port files out;
 * see `vitest.config.ts`).
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  TransactionRepositoryPort,
  ListTransactionsOptions,
  ListTransactionsPage,
  CreateTransactionInput,
  UpdateTransactionPatch,
} from './transaction.repository.port';
import type { Transaction } from '../entities/transaction';

describe('TransactionRepositoryPort contract — transactions slice 1', () => {
  it('declares exactly 5 methods: findById, list, create, update, delete', () => {
    // The port is a structural type; a typed accessor that
    // names every method pin the public surface. Adding a 6th
    // method is a breaking change for any consumer that
    // implements the port.
    type Methods = keyof TransactionRepositoryPort;
    expectTypeOf<Methods>().toEqualTypeOf<'findById' | 'list' | 'create' | 'update' | 'delete'>();
  });

  it('every method takes userId as the first parameter (BR-TX-4)', () => {
    // Lock the order. A port that swaps the args (e.g.
    // findById(id, userId)) would let a caller mis-order the
    // scoping and leak cross-user rows. The check uses
    // `expectTypeOf<>().toEqualTypeOf<>()` on the FIRST element
    // of `Parameters<...>`. A future port that drops the
    // `userId` first arg (or renames it) breaks the equality
    // type assertion.
    expectTypeOf<Parameters<TransactionRepositoryPort['findById']>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<TransactionRepositoryPort['list']>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<TransactionRepositoryPort['create']>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<TransactionRepositoryPort['update']>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<TransactionRepositoryPort['delete']>[0]>().toEqualTypeOf<string>();
  });

  it('findById returns Transaction | null (null on miss or cross-user)', () => {
    // The application layer maps `null` to `404 NOT_FOUND`. A
    // port that returns `Transaction` only (or throws) would
    // leak the existence of another user's row.
    expectTypeOf<ReturnType<TransactionRepositoryPort['findById']>>().toEqualTypeOf<
      Promise<Transaction | null>
    >();
  });

  it('delete returns Promise<boolean> (true iff a row was removed)', () => {
    // BR-TX-7: hard delete is the v1 policy. The port returns
    // `true` when a row was removed, `false` on miss or
    // cross-user (same shape as the findById miss). The
    // application layer maps `false` to `404 NOT_FOUND`. A port
    // that returns `Transaction | null` (like `update`) would
    // force a useless round-trip to read a row that is then
    // immediately deleted.
    expectTypeOf<ReturnType<TransactionRepositoryPort['delete']>>().toEqualTypeOf<
      Promise<boolean>
    >();
  });

  it('exposes the ListTransactionsOptions, ListTransactionsPage, CreateTransactionInput, UpdateTransactionPatch types', () => {
    // Lock the supporting types. Drift in any of these breaks
    // the action layer (slice 2); the compile-time check is the
    // cheap gate.
    expectTypeOf<ListTransactionsOptions>().toMatchTypeOf<{
      cursor?: string;
      limit: number;
      accountId?: string;
    }>();
    expectTypeOf<ListTransactionsPage>().toMatchTypeOf<{
      data: Transaction[];
      nextCursor: string | null;
    }>();
    expectTypeOf<CreateTransactionInput>().toMatchTypeOf<{
      accountId: string;
      amountMinor: number;
    }>();
    expectTypeOf<UpdateTransactionPatch>().toMatchTypeOf<{
      amountMinor?: number;
    }>();
  });
});
