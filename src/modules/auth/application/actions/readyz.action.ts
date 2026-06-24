/**
 * readyzAction — application-layer entry point for
 * `GET /api/readyz`. Separate from `healthAction`:
 *
 * - `healthAction` is a **liveness** probe: "the process
 *   is up". It does no I/O and always returns 200 as long
 *   as Node is running.
 * - `readyzAction` is a **readiness** probe: "the process
 *   is up AND its hard dependencies are reachable". It
 *   issues a `SELECT 1` against Postgres with a 1-second
 *   timeout. 503 on failure is the conventional Fly.io
 *   health-check signal; the orchestrator stops routing
 *   traffic to this instance until the next probe
 *   succeeds.
 *
 * Per the `logging-monitoring` skill, the DB probe is
 * the only signal that the deploy is ready to serve real
 * traffic. A cold Postgres connection in a freshly
 * restarted instance can take 100-300 ms; the 1-second
 * budget leaves headroom for that without masking a
 * genuinely down DB.
 *
 * The Prisma client is read from `@/shared/db/prisma` so
 * the probe uses the same connection pool the rest of
 * the app uses (the test suite injects a fake via
 * `setPrismaClient`).
 */

import { prisma } from '@/shared/db/prisma';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import { logger } from '@/shared/logger/logger';

const READYZ_TIMEOUT_MS = 1000;

export type ReadyzActionResult =
  | { status: 200; data: { status: 'ok'; db: 'ok' } }
  | { status: 503; error: { code: ErrorCode; message: string } };

/**
 * Race a `SELECT 1` against a 1-second timeout. Returns
 * `503 DB_DOWN` (translated by the central error handler
 * to a 503 envelope) on timeout or any DB error. The
 * timeout uses `Promise.race` with a `setTimeout` so a
 * stuck Prisma query cannot block the readiness probe
 * past the budget.
 *
 * F-07: the timeout timer is captured and `clearTimeout`'d
 * in the `finally` block so a successful probe does not
 * leak the timer (which would keep the event loop alive
 * for up to 1 s after every healthy readyz).
 */
export async function readyzAction(): Promise<ReadyzActionResult> {
  const probe = (async () => {
    try {
      await prisma().$queryRaw`SELECT 1`;
    } catch (err) {
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'DB probe failed.',
        cause: err,
      });
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'DB probe timed out.',
        }),
      );
    }, READYZ_TIMEOUT_MS);
  });

  try {
    await Promise.race([probe, timeout]);
    return { status: 200, data: { status: 'ok', db: 'ok' } };
  } catch (err) {
    logger.error('readyz_failed', {
      errorName: err instanceof Error ? err.name : 'Unknown',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return {
      status: 503,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Readiness probe failed.',
      },
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
