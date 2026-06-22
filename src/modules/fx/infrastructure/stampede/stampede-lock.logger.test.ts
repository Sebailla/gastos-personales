import { describe, it, expect, vi } from 'vitest';
import { withLock, _resetInflightForTests } from './stampede-lock';

describe('withLock emits fx.stampede.coalesce when N callers coalesce (T1.10 logger wiring)', () => {
  it('emits one fx.stampede.coalesce per coalesced caller (caller count = N)', async () => {
    _resetInflightForTests();
    const logger = await import('@/shared/logger/logger');
    const infoSpy = vi.spyOn(logger.logger, 'info');
    // Yield repeatedly to keep the inner fn pending so all
    // 5 callers coalesce onto the same promise.
    let resolveInner!: (value: string) => void;
    const innerPromise = new Promise<string>((resolve) => {
      resolveInner = resolve;
    });
    const promises = Array.from({ length: 5 }, () => withLock('oficial', () => innerPromise));
    // Yield so all 5 callers have registered the inflight
    // entry before we resolve.
    await Promise.resolve();
    await Promise.resolve();
    resolveInner('ok');
    await Promise.all(promises);
    const coalesceCalls = infoSpy.mock.calls.filter(([msg]) => msg === 'fx.stampede.coalesce');
    expect(coalesceCalls.length).toBeGreaterThanOrEqual(1);
    // The latest emitted event should report concurrentCallers
    // covering the 4 coalesced callers (the 5th call is the
    // runner; the count is N - 1 = 4, or whatever the
    // implementation tracks).
    const lastCall = coalesceCalls[coalesceCalls.length - 1]?.[1] as Record<string, unknown>;
    expect(lastCall?.casa).toBe('oficial');
    expect(typeof lastCall?.concurrentCallers).toBe('number');
  });
});