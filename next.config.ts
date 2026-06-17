import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @node-rs/argon2 ships NAPI prebuilt binaries (no node-gyp at
  // install time). Webpack can't bundle it; Next.js 16's Edge
  // runtime can't load it either. Marking it as
  // serverExternalPackages forces Next.js to require() it at
  // runtime in the Node.js server only. The CI build was failing
  // with `module-not-found` on @node-rs/argon2/browser.js;
  // serverExternalPackages bypasses the bundle attempt that
  // produces that error.
  serverExternalPackages: ['@node-rs/argon2'],
  // Next.js 16 promoted `experimental.typedRoutes` to a top-level
  // option. Keeping it here would boot with a warning and pin us to
  // a deprecated config surface. Promote it.
  typedRoutes: true,
  // Security headers (BR-AUTH-11 baseline).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

// `withSentryConfig` is a no-op when SENTRY_DSN is not set (the
// `sentry.server.config.ts` / `sentry.client.config.ts` files
// guard `Sentry.init()` on the DSN being present). We pass the
// config unconditionally so the project can opt in to Sentry by
// setting the env vars without code changes.
export default withSentryConfig(nextConfig, {
  // Hide Sentry's source maps by default in dev. Production builds
  // upload via the Sentry CLI at release time.
  sourcemaps: { disable: process.env.NODE_ENV !== 'production' },
  // Disable telemetry collection (Next.js collects anonymous
  // telemetry by default; this also disables Sentry's).
  disableLogger: true,
  // Tree-shake Sentry when SENTRY_DSN is not set.
  silent: !process.env.SENTRY_DSN,
  // Upload source maps only when a release is set (CI).
  widenClientFileUpload: true,
});
