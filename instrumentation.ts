// Next.js 16 instrumentation hook. Runs once at server startup,
// before any route handler. Used here to:
// - register Sentry's request and error handlers via `register()`
//   (the SDK itself is initialised in `sentry.server.config.ts`,
//   loaded by Next before this file);
// - load the Node-only shutdown machinery from
//   `instrumentation-node.ts` (SIGTERM/SIGINT, unhandledRejection,
//   uncaughtException) per the `logging-monitoring` skill.
//
// Why this file is split:
// The instrumentation hook is bundled for both the Node.js and
// Edge runtimes. The shutdown machinery (signal handlers,
// `process.exit`, Prisma pool drain) is Node-only. The Next.js
// bundler does a conservative static scan of every Node.js API
// in this file and fails the build if any leaks into a bundle
// that could be Edge-targeted — `process.versions`, `process.exit`,
// `process.on` all trigger it, even when wrapped in a runtime
// guard. The bundler CAN tree-shake a dynamic import gated on
// `process.env.NEXT_RUNTIME === 'nodejs'` because that env var
// is statically replaced at build time (`'nodejs'` for the Node
// bundle, `'edge'` for the Edge bundle). The dynamic import is
// resolved to nothing in the Edge bundle, so the Node-only
// module never gets parsed there. The Sentry Edge SDK handles
// crash capture inside Edge functions via its own entry; we
// deliberately do not replicate it here.

export async function register(): Promise<void> {
  // Node-only shutdown machinery. The dynamic import is
  // tree-shaken out of the Edge bundle by the Next.js
  // bundler (it statically replaces `process.env.NEXT_RUNTIME`
  // with `'nodejs'` or `'edge'` at build time), so the Edge
  // runtime never sees the signal handlers, `process.exit`,
  // or `process.on` calls in `instrumentation-node.ts`.
  // The Sentry Edge SDK handles crash capture inside Edge
  // functions via its own entry; we deliberately do not
  // replicate it here.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
