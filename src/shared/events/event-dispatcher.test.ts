import { describe, it, expect, vi } from 'vitest';
import { EventDispatcher } from './event-dispatcher';

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
