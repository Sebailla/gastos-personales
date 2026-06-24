import { describe, it, expect, vi } from 'vitest';
import { withLock, _resetInflightForTests } from './stampede-lock';

describe('withLock (per-process stampede coalesce)', () => {
  it('10 concurrent same-casa callers invoke the inner fn exactly once', async () => {
    _resetInflightForTests();
    const fetchSpy = vi.fn().mockResolvedValue('payload');
    const promises = Array.from({ length: 10 }, () => withLock('oficial', () => fetchSpy()));
    const results = await Promise.all(promises);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array(10).fill('payload'));
  });

  it('concurrent calls for different casas invoke the inner fn independently (no cross-casa blocking)', async () => {
    _resetInflightForTests();
    const fetchSpy = vi.fn().mockImplementation(async (casa: string) => casa);
    const [a, b] = await Promise.all([
      withLock('oficial', () => fetchSpy('oficial')),
      withLock('blue', () => fetchSpy('blue')),
    ]);
    expect(a).toBe('oficial');
    expect(b).toBe('blue');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('after the lock resolves, a fresh withLock(casa, ...) invokes the inner fn again', async () => {
    _resetInflightForTests();
    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    await withLock('oficial', () => fetchSpy());
    await withLock('oficial', () => fetchSpy());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('a rejecting inner fn deletes the inflight entry (next caller re-runs)', async () => {
    _resetInflightForTests();
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    await expect(withLock('oficial', () => fetchSpy())).rejects.toThrow('boom');
    await expect(withLock('oficial', () => fetchSpy())).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('100 concurrent callers all see the same returned value (promise-sharing semantics)', async () => {
    _resetInflightForTests();
    const sentinel = Symbol('shared');
    const fn = vi.fn().mockImplementation(async () => {
      // Yield to the microtask queue to interleave with the 100 awaits.
      await Promise.resolve();
      return sentinel;
    });
    const results = await Promise.all(
      Array.from({ length: 100 }, () => withLock('oficial', () => fn())),
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r === sentinel)).toBe(true);
  });
});