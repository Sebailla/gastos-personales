// Sentry client-side configuration. Loaded by Next.js in the
// browser bundle. Initialises the SDK only when a public DSN is
// present (NEXT_PUBLIC_SENTRY_DSN, so it can be inlined into the
// client JS without leaking the server-only DSN).

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
