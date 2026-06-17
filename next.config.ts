import type { NextConfig } from 'next';

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

export default nextConfig;
