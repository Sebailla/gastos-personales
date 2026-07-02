import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

// `script-src` is one of the directives inside the
// `Content-Security-Policy` header (`next.config.ts` line ~52,
// joined into a single comma-separated string with the other
// directives).
//
// React in dev mode uses eval() for HMR and to reconstruct
// callstacks from a different environment, which a strict CSP
// blocks. We allow `'unsafe-eval'` only in non-production
// environments; `process.env.NODE_ENV` is statically replaced
// at build time by Next.js, so the prod bundle never sees
// this directive and the 4R-R1 baseline stays intact.
//
// PREVIOUS BUG (fixed 2026-07-02): `scriptSrc` was emitted as a
// bare value (`'self' 'unsafe-inline' ...`) and then joined into
// the CSP header with `; ` between directives. That left the
// browser parsing the value as a directive-name on its own,
// because each `; ` boundary expects a directive-name first,
// not a quoted value. Chrome rejected with:
//
//   "The Content-Security-Policy directive name ''self''
//    contains one or more invalid characters."
//
// The list of permitted sources MUST include the directive name
// (`script-src`) as a prefix; otherwise the browser treats the
// next-token as a directive-name (not a directive-value) and
// fails the parse. The literal `'self'` substring is what made
// Chrome think the whole value was a malformed directive-name.
const scriptSrc =
  process.env.NODE_ENV !== 'production'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io https://accounts.google.com"
    : "script-src 'self' 'unsafe-inline' https://*.sentry.io https://accounts.google.com";

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
  // Security headers (BR-AUTH-11 baseline + HSTS + CSP).
  // 4R-R1 finding: HSTS and CSP were missing, leaving a
  // HTTPS-downgrade and content-injection surface on a public
  // finance app. The CSP allowlist mirrors the actual surface
  // (self + Sentry + Google OAuth + Auth.js + Sentry uploads);
  // any new external origin needs an explicit entry here.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.sentry.io https://accounts.google.com https://oauth2.googleapis.com",
              "frame-src 'self' https://accounts.google.com https://*.sentry.io",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com",
            ].join('; '),
          },
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
//
// `createNextIntlPlugin('./src/i18n/request.ts')` is the next-intl
// build-time plugin that wires `src/i18n/request.ts`'s
// `getRequestConfig` into the Next.js bundler so Server Components
// can `await getTranslations()` synchronously. Without this plugin,
// `next-intl`'s tree-shaking cannot statically resolve which
// messages are referenced, and the build emits a warning. The
// plugin takes only the path to the request config; it does NOT
// alter runtime behavior (the middleware handles locale resolution
// at request time).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withSentryConfig(withNextIntl(nextConfig), {
  // Hide Sentry's source maps by default in dev. Production builds
  // upload via the Sentry CLI at release time.
  sourcemaps: { disable: process.env.NODE_ENV !== 'production' },
  // Tree-shake Sentry when SENTRY_DSN is not set.
  silent: !process.env.SENTRY_DSN,
  // Upload source maps only when a release is set (CI).
  widenClientFileUpload: true,
});
