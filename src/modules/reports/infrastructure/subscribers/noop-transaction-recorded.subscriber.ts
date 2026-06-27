/**
 * `createNoopHandler` — no-op subscriber for the
 * `TransactionRecorded` event (REQ-RPT-7, BR-RPT-5).
 *
 * Slice 3 deliverable — the composition root wires this handler
 * exactly once in `buildAppDeps`. The seam is registered so the
 * future materializer replaces the handler in-place without an
 * interface change.
 *
 * Per design §6.2: the factory returns
 * `async (event: TransactionRecordedPayload): Promise<void>` that
 * debug-logs `reports.noop.transaction-recorded` with the
 * `{ userId, transactionId }` payload and returns. No side
 * effects beyond the debug log.
 *
 * The factory takes the logger as a dependency (no module-level
 * import) so tests can inject a spy.
 */

import type { TransactionRecordedPayload } from '@/shared/events/event-dispatcher';

/**
 * Logger surface the noop handler depends on. Mirrors the
 * `logger` singleton exported from `@/shared/logger/logger` —
 * typed structurally here so test fixtures can pass partial
 * mocks without pulling in the shared singleton.
 */
type Logger = {
  debug: (message: string, payload?: unknown) => void;
  info: (message: string, payload?: unknown) => void;
  warn: (message: string, payload?: unknown) => void;
  error: (message: string, payload?: unknown) => void;
};

export function createNoopHandler(logger: Logger) {
  return async (event: TransactionRecordedPayload): Promise<void> => {
    logger.debug('reports.noop.transaction-recorded', {
      userId: event.userId,
      transactionId: event.transactionId,
    });
  };
}
