import { describe, it, expect, vi, expectTypeOf } from 'vitest';
import { EventDispatcher } from './event-dispatcher';
import {
  TransactionRecorded,
  type TransactionRecordedPayload,
  type DomainEvent,
} from './event-dispatcher';

describe('EventDispatcher', () => {
  it('invokes every registered subscriber exactly once', async () => {
    const d = new EventDispatcher();
    const a = vi.fn();
    const b = vi.fn();
    d.subscribe('UserRegistered', a);
    d.subscribe('UserRegistered', b);

    await d.dispatch({
      type: 'UserRegistered',
      payload: {
        userId: 'u1',
        email: 'a@b.com',
        provider: 'local',
        occurredAt: new Date().toISOString(),
      },
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does not call subscribers of a different event type', async () => {
    const d = new EventDispatcher();
    const a = vi.fn();
    d.subscribe('UserRegistered', a);

    await d.dispatch({
      type: 'UserSignedIn',
      payload: { userId: 'u1', provider: 'google', occurredAt: new Date().toISOString() },
    });

    expect(a).not.toHaveBeenCalled();
  });

  it('catches a throwing subscriber and continues with the next one', async () => {
    const d = new EventDispatcher();
    const a = vi.fn(() => {
      throw new Error('boom');
    });
    const b = vi.fn();
    d.subscribe('UserRegistered', a);
    d.subscribe('UserRegistered', b);

    await d.dispatch({
      type: 'UserRegistered',
      payload: {
        userId: 'u1',
        email: 'a@b.com',
        provider: 'local',
        occurredAt: new Date().toISOString(),
      },
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returns the count of subscribers invoked', async () => {
    const d = new EventDispatcher();
    d.subscribe('UserRegistered', () => undefined);
    d.subscribe('UserRegistered', () => undefined);

    const count = await d.dispatch({
      type: 'UserRegistered',
      payload: {
        userId: 'u1',
        email: 'a@b.com',
        provider: 'local',
        occurredAt: new Date().toISOString(),
      },
    });

    expect(count).toBe(2);
  });
});

/**
 * RED: TransactionRecorded event variant (3 cases).
 *
 * Slice 2 binding. The transactions capability dispatches a
 * `TransactionRecorded` event after a successful create (REQ-TX-13,
 * BR-TX-11). The new variant joins the existing `DomainEvent`
 * union; the existing variants keep their payload shapes. No
 * subscriber ships in v1; the union membership is the contract.
 *
 * Branches:
 *  1. The `TransactionRecorded` variant is accepted by
 *     `EventDispatcher.dispatch` (compile-time via `DomainEvent`).
 *  2. The `TransactionRecordedPayload` type is exported with the
 *     documented field set.
 *  3. A subscribe + dispatch round-trip invokes the subscriber
 *     exactly once with the supplied payload.
 */
describe('EventDispatcher — slice 2 TransactionRecorded variant', () => {
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

  it('exposes TransactionRecorded as a const string and a DomainEvent variant (compile-time)', () => {
    // The string constant is the stable subscriber key.
    expect(TransactionRecorded).toBe('TransactionRecorded');
    // The variant is a member of the DomainEvent union at the
    // type level. expectTypeOf gives a compile-time error if the
    // union does not include the new variant.
    expectTypeOf<TransactionRecordedPayload['userId']>().toEqualTypeOf<string>();
    // Constructing a DomainEvent with the new type compiles.
    const event: DomainEvent = { type: 'TransactionRecorded', payload };
    expect(event.type).toBe('TransactionRecorded');
  });

  it('TransactionRecordedPayload carries the documented field set', () => {
    expect(payload.userId).toBe('u-1');
    expect(payload.transactionId).toBe('tx-1');
    expect(payload.accountId).toBe('fa-1');
    expect(payload.direction).toBe('EXPENSE');
    expect(payload.amountMinor).toBe(1000);
    expect(payload.currency).toBe('USD');
    expect(payload.casa).toBe('OFICIAL');
    expect(payload.convertedAmountMinor).toBe(1100000);
    expect(payload.convertedCurrency).toBe('ARS');
    expect(payload.occurredAt).toBe('2026-06-23T12:00:00.000Z');
  });

  it('subscribe + dispatch round-trip invokes the subscriber exactly once', async () => {
    const d = new EventDispatcher();
    const handler = vi.fn();
    d.subscribe('TransactionRecorded', handler);

    await d.dispatch({ type: 'TransactionRecorded', payload });

    expect(handler).toHaveBeenCalledTimes(1);
    // The subscriber received the full payload, not a stripped
    // shape — the wire contract is the publish surface.
    expect(handler).toHaveBeenCalledWith({ type: 'TransactionRecorded', payload });
  });
});
