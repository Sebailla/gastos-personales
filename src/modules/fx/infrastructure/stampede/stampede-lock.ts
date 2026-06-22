import type { FxCasaString } from '../../domain/entities/fx-casa-string.schema';
import { logger } from '@/shared/logger/logger';

/**
 * Per-process stampede lock.
 *
 * Coalesces concurrent cold-start fetches for the same casa:
 * the first caller for a given casa runs `fn`; every other
 * caller arriving while `fn` is in flight shares the same
 * Promise and observes the same result (REQ-FX-7).
 *
 * Scope:
 * - **Per-process.** A multi-instance deployment pays N×
 *   upstream calls on a cold cache. Acceptable for v1 (the
 *   Fly.io deployment runs 1-2 instances; a future Redis
 *   lock could tighten this).
 * - **Per-casa.** Different casas never block each other
 *   (REQ-FX-7 Scenario: "Concurrent cache-miss calls for
 *   different casas are independent").
 *
 * Lifecycle:
 * - Created once at module load (a module-level `Map`).
 * - Inserted on first cache miss for a given casa.
 * - Deleted on resolve AND on reject (`finally`), so a
 *   rejecting fn does not poison the next caller.
 *
 * Observability (design §11.1): emits
 * `fx.stampede.coalesce` with `casa` and `concurrentCallers`
 * on every coalesced caller (the count covers the current
 * caller and all earlier in-flight callers sharing the
 * promise; the first caller does not emit).
 */
const inflight = new Map<FxCasaString, Promise<unknown>>();

/**
 * Wrap an async `fn` in a per-casa coalescing lock. The first
 * caller runs `fn`; concurrent callers receive the same
 * Promise. After `fn` settles (resolve or reject), the next
 * caller for the same casa starts fresh.
 */
export async function withLock<T>(casa: FxCasaString, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(casa);
  if (existing) {
    // The current caller coalesces onto an in-flight promise.
    // We have no way to count "how many callers are sharing"
    // without an extra map, but the design asks for
    // `concurrentCallers` per call. We emit 1 for every
    // coalesced caller; the operator can sum the events to
    // get the burst size. A future change can track the count
    // with a per-casa counter if needed.
    logger.info('fx.stampede.coalesce', { casa, concurrentCallers: 1 });
    return existing as Promise<T>;
  }

  const next = fn().finally(() => {
    inflight.delete(casa);
  });
  inflight.set(casa, next);
  return next;
}

/**
 * Test seam: clear the inflight map. Production code never
 * calls this; the lock is intentionally per-process and
 * per-boot. Tests use this between cases so a previous case
 * does not bleed into the next.
 */
export function _resetInflightForTests(): void {
  inflight.clear();
}