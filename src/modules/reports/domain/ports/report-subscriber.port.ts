/**
 * Domain port: `ReportSubscriberPort`.
 *
 * Declares the seam for the `TransactionRecorded` subscription
 * (REQ-RPT-7, BR-RPT-5). v1 ships a no-op handler registered at
 * composition time; the future materializer (a later change)
 * swaps the handler for a real consumer without an interface
 * change. The seam exists so the spec can lock the contract and
 * the composition-root test can assert exactly one subscriber
 * exists for `TransactionRecorded` after `buildAppDeps` runs
 * (REQ-RPT-7 scenario: composition-root boot registers the no-op
 * handler).
 *
 * Why a port (and not a direct call into the central
 * `EventDispatcher`)? The reports module owns the seam because
 * the future materializer is a reports concern (it materializes
 * reports aggregates). The seam is consumed by the noop handler
 * in slice 3 (`src/modules/reports/infrastructure/subscribers/`)
 * and by the future materializer.
 *
 * The single method:
 * - takes a handler typed against `TransactionRecordedPayload`
 *   (the union member the central dispatcher already carries);
 * - returns an opaque `Unsubscribe` handle for test teardown.
 *
 * The reports module does NOT import from the central dispatcher
 * directly — it consumes the kernel's `TransactionRecordedPayload`
 * type and implements this port. The composition root wires the
 * concrete handler into both the central dispatcher AND this
 * port's signature at the seam (slice 3).
 */

import type { TransactionRecordedPayload } from '@/shared/events/event-dispatcher';

/** Opaque unsubscribe handle. Returns `void`. */
export type Unsubscribe = () => void;

/**
 * The subscription port. One method (`onTransactionRecorded`)
 * — the seam the future materializer will consume. The
 * composition root's `buildAppDeps` subscribes the noop handler
 * exactly once (REQ-RPT-7, BR-RPT-5); the build-app-deps test
 * (slice 3) asserts `subscriberCount('TransactionRecorded') ===
 * before + 1` after the call.
 */
export interface ReportSubscriberPort {
  /**
   * Subscribe a handler to the `TransactionRecorded` event. The
   * composition root wires a no-op handler in v1; the future
   * materializer swaps the handler for a real consumer without
   * an interface change.
   *
   * Returns an unsubscribe function for test teardown.
   */
  onTransactionRecorded(
    handler: (event: TransactionRecordedPayload) => void | Promise<void>,
  ): Unsubscribe;
}
