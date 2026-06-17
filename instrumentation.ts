// Next.js 16 instrumentation hook. Runs once at server startup,
// before any route handler. Used here to register Sentry's request
// and error handlers via `register()`. The SDK itself is
// initialised in `sentry.server.config.ts` (loaded by Next before
// this file).

export async function register(): Promise<void> {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    // No-op if Sentry was never initialised (e.g. DSN missing).
    Sentry.captureConsoleIntegration?.();
  }
}
