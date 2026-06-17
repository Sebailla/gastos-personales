// Sentry server-side configuration. Loaded by Next.js before any
// server module. Initialises the SDK only when a DSN is present
// (the app must run locally and in CI without Sentry wired up).

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    // Sample 100% of transactions in dev; tune down in prod.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Don't send PII unless explicitly opted in. The auth logger
    // already filters `email`, `passwordHash`, session tokens etc.
    sendDefaultPii: false,
  });
}
