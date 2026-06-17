/**
 * Tests for the `withRetry` helper used by `signInCallback` and
 * any other transient-failure-tolerant code path in the project.
 *
 * The retry policy is verified at the boundary: does the function
 * give up after N attempts, does it apply backoff, and does it
 * distinguish retryable from fatal errors via `shouldRetry`.
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './with-retry';

describe('withRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { attempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure and returns the eventual success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1, onRetry });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]?.[1]).toBe(2);
    expect(onRetry.mock.calls[1]?.[1]).toBe(3);
  });

  it('throws the last error when all attempts fail', async () => {
    const err = new Error('always fails');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    const onRetry = vi.fn();
    await expect(
      withRetry(fn, {
        attempts: 3,
        baseDelayMs: 1,
        shouldRetry: () => false,
        onRetry,
      }),
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('rejects attempts < 1', async () => {
    await expect(withRetry(() => Promise.resolve(1), { attempts: 0 })).rejects.toThrow(
      'withRetry: attempts must be >= 1',
    );
  });

  it('applies exponential backoff (within jitter tolerance)', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('1')).mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    await withRetry(fn, {
      attempts: 2,
      baseDelayMs: 100,
      jitter: 0, // disable jitter for determinism
      onRetry,
    });
    const delayMs = onRetry.mock.calls[0]?.[2] as number;
    // First retry after the initial failure: 100 * 2^0 = 100ms.
    expect(delayMs).toBe(100);
  });
});
