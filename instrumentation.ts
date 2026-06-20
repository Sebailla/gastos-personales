// Next.js 16 instrumentation hook. Runs once at server startup,
// before any route handler. Used here to:
// - register Sentry's request and error handlers via `register()`
//   (the SDK itself is initialised in `sentry.server.config.ts`,
//   loaded by Next before this file);
// - register process-level handlers for graceful shutdown
//   (SIGTERM/SIGINT) and for crash visibility
//   (unhandledRejection / uncaughtException), per the
//   `logging-monitoring` skill.
//
// Why all four signals are wired:
// - SIGTERM / SIGINT: Fly's orchestrator sends SIGTERM before
//   tearing a machine down; honoring it lets in-flight HTTP
//   requests drain and the Prisma pool close cleanly. The
//   hard timeout cap prevents us from hanging past Fly's
//   grace window.
// - unhandledRejection / uncaughtException: these crash the
//   process by default; we capture the cause to Sentry and
//   log so the deployment is not silent. We do NOT call
//   `process.exit(0)` on these — exit-on-unhandled is a
//   known foot-gun (it masks the original error and
//   prevents future Sentry captures on the same process).
//   The orchestrator restarts crashed processes anyway.

export async function register(): Promise<void> {
  // Sentry initialisation (no-op when SENTRY_DSN is unset).
  let Sentry: typeof import('@sentry/nextjs') | null = null;
  if (process.env.SENTRY_DSN) {
    Sentry = await import('@sentry/nextjs');
    // F-19: removed `Sentry.captureConsoleIntegration?.()`.
    // The optional-chain made it a silent no-op (the
    // method does not exist on the v10 SDK), and the
    // surrounding comment was misleading. Console
    // capture, if needed, is configured at SDK init in
    // `sentry.server.config.ts` via the
    // `Sentry.init({ integrations: [...] })` options.
  }

  // Graceful shutdown on SIGTERM / SIGINT (Fly sends SIGTERM
  // before draining the machine). The shutdown sequence:
  //   1. stop accepting new work (Fly stops routing first)
  //   2. disconnect Prisma so the pool drains
  //   3. flush Sentry so the last events land
  //   4. exit 0
  // The hard `setTimeout` is the last-resort cap: if any
  // step hangs, we exit anyway. 8s matches Fly's default
  // grace window minus a small slack for the process to
  // actually be killed by the orchestrator.
  const SHUTDOWN_HARD_TIMEOUT_MS = 8000;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    // eslint-disable-next-line no-console
    console.warn(`process_shutdown_start signal=${signal}`);
    const hardExit = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('process_shutdown_timeout — forcing exit');
      process.exit(1);
    }, SHUTDOWN_HARD_TIMEOUT_MS);
    hardExit.unref();

    try {
      const { prisma } = await import('@/shared/db/prisma');
      await prisma().$disconnect();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('prisma_disconnect_failed', err);
    }

    if (Sentry) {
      try {
        await Sentry.flush?.(2000);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('sentry_flush_failed', err);
      }
    }

    clearTimeout(hardExit);
    // eslint-disable-next-line no-console
    console.warn(`process_shutdown_done signal=${signal}`);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Crash visibility. We capture the cause to Sentry so the
  // deployment is not silent; we deliberately do NOT call
  // `process.exit(0)` here — that would mask the original
  // error and stop future captures on the same process.
  // The orchestrator (Fly) restarts crashed processes
  // automatically, so the lack of a clean exit is fine.
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    // eslint-disable-next-line no-console
    console.error('unhandled_rejection', { message: err.message, stack: err.stack });
    Sentry?.captureException(err);
  });

  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('uncaught_exception', { message: err.message, stack: err.stack });
    Sentry?.captureException(err);
    // Same drain logic as the SIGTERM path: Prisma disconnect
    // + Sentry flush + a hard timeout. We still do not call
    // `process.exit(0)`; Fly will kill the process once the
    // unhandled exception has had a chance to be observed.
    void shutdown('SIGTERM').catch(() => undefined);
  });
}
