/**
 * Compile-time port-shape assertions for `ReportSubscriberPort`.
 *
 * Locks the subscription-seam contract at the type level so a
 * future port that drops the `onTransactionRecorded` method (or
 * changes the handler signature) breaks the equality type
 * assertion and fails `pnpm typecheck`. Mirrors the
 * `ReportsRepositoryPort` contract test (T-RPT-002) and the
 * canonical transactions port test at
 * `src/modules/transactions/domain/interfaces/transaction.repository.port.test.ts`.
 *
 * The runtime body has nothing to execute (the assertions are
 * purely type-level); vitest reports the suite as "passed" while
 * `tsc` enforces the contract.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { ReportSubscriberPort, Unsubscribe } from './report-subscriber.port';
import type { TransactionRecordedPayload } from '@/shared/events/event-dispatcher';

describe('ReportSubscriberPort contract — reports slice 1', () => {
  it('declares exactly 1 method: onTransactionRecorded', () => {
    type Methods = keyof ReportSubscriberPort;
    expectTypeOf<Methods>().toEqualTypeOf<'onTransactionRecorded'>();
  });

  it('onTransactionRecorded accepts a handler typed against TransactionRecordedPayload', () => {
    type Handler = Parameters<ReportSubscriberPort['onTransactionRecorded']>[0];
    // The handler's parameter MUST be the canonical payload (not
    // a generic `unknown`). A port that accepted `unknown` would
    // lose the type-level link to the dispatcher's union member.
    expectTypeOf<Parameters<Handler>[0]>().toEqualTypeOf<TransactionRecordedPayload>();
  });

  it('onTransactionRecorded returns Unsubscribe (opaque void-returning handle)', () => {
    // The unsubscribe handle is `() => void` — the test seam
    // returns it but never inspects the body. A port that
    // returned `Promise<void>` would force test teardown to
    // await; the simpler shape lets tests `dispatcher.unsubscribe()`
    // synchronously.
    expectTypeOf<
      ReturnType<ReportSubscriberPort['onTransactionRecorded']>
    >().toEqualTypeOf<Unsubscribe>();
  });

  it('Unsubscribe is a () => void function type', () => {
    // Pin the opaque handle's shape. A future refactor that
    // makes `Unsubscribe` a class instance (e.g. for cleanup
    // chaining) would break this assertion; reviewers should
    // treat such a change as a breaking-API decision.
    expectTypeOf<Unsubscribe>().toEqualTypeOf<() => void>();
  });
});
