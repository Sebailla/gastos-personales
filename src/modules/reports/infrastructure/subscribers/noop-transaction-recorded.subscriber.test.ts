/**
 * Tests for `createNoopHandler` (T-RPT-201).
 *
 * Slice 3 deliverable — the no-op handler that satisfies REQ-RPT-7
 * (the `TransactionRecorded` event gains at least one subscriber).
 * The composition root wires this handler in `buildAppDeps`
 * (BR-RPT-5); the future materializer replaces it in-place.
 *
 * Tests:
 *   (1) Returns `Promise<void>` and does not throw on a sample
 *       `TransactionRecordedPayload`.
 *   (2) Calls `logger.debug` with the
 *       `reports.noop.transaction-recorded` event name + the
 *       `{ userId, transactionId }` payload — the debug sink
 *       is the only side effect (no re-dispatch, no DB write).
 *
 * Per §11.3 of the design.
 */

import { describe, it, expect, vi } from 'vitest';
import { createNoopHandler } from './noop-transaction-recorded.subscriber';
import type { TransactionRecordedPayload } from '@/shared/events/event-dispatcher';

describe('createNoopHandler', () => {
  it('returns Promise<void> and does not throw on a sample payload', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const handler = createNoopHandler(logger);
    const payload: TransactionRecordedPayload = {
      userId: 'u-1',
      transactionId: 'tx-1',
      accountId: 'fa-1',
      direction: 'EXPENSE',
      amountMinor: 1000,
      currency: 'USD',
      casa: 'OFICIAL',
      convertedAmountMinor: 1100000,
      convertedCurrency: 'ARS',
      occurredAt: '2026-06-23T12:00:00.000Z',
    };
    const result = handler(payload);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it('calls logger.debug with the noop event name + { userId, transactionId } payload', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const handler = createNoopHandler(logger);
    const payload: TransactionRecordedPayload = {
      userId: 'u-9',
      transactionId: 'tx-9',
      accountId: 'fa-9',
      direction: 'INCOME',
      amountMinor: 500,
      currency: 'ARS',
      casa: null,
      convertedAmountMinor: 500,
      convertedCurrency: 'ARS',
      occurredAt: '2026-06-23T12:00:00.000Z',
    };
    await handler(payload);
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith('reports.noop.transaction-recorded', {
      userId: 'u-9',
      transactionId: 'tx-9',
    });
  });
});
