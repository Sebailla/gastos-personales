// proxy.ts
// Next.js proxy: 307 redirect for unauthenticated App Router pages.
// Hono API routes under /api/* are excluded at the matcher level
// (they return their own 401/403/JSON envelopes and must not be
// coerced into an HTML redirect).
//
// Public paths (signin, signout, root) are exempted from the redirect
// so that the signin page itself is reachable when not authenticated.
//
// Renamed from middleware.ts in Next.js 16: the file convention is
// now `proxy.ts`. Per the Next.js 16 docs, the proxy always runs in
// the Node.js runtime, so no `runtime` segment config is allowed.

import { auth } from '@/modules/auth';
import { NextResponse } from 'next/server';

/**
 * Single source of truth for paths the proxy treats as public.
 * Each entry is either `{ exact: string }` (path must equal) or
 * `{ prefix: string }` (path must equal OR start with `prefix + '/'`).
 * The matcher below consumes the same list so the proxy exclusion
 * and the redirect exemption cannot drift.
 */
const PUBLIC_PATHS: ReadonlyArray<
  | { readonly kind: 'exact'; readonly path: string }
  | { readonly kind: 'prefix'; readonly path: string }
> = [
  { kind: 'exact', path: '/' },
  { kind: 'prefix', path: '/auth/signin' },
  { kind: 'prefix', path: '/auth/signout' },
  { kind: 'prefix', path: '/auth/register' },
] as const;

export function isPublicPath(pathname: string): boolean {
  for (const entry of PUBLIC_PATHS) {
    if (entry.kind === 'exact') {
      if (pathname === entry.path) return true;
    } else {
      if (pathname === entry.path || pathname.startsWith(`${entry.path}/`)) return true;
    }
  }
  return false;
}

/**
 * The Next.js proxy matcher. Turbopack requires the matcher to be
 * a static string literal (not a function result). This must stay
 * in sync with `PUBLIC_PATHS` above: if a new public path is added
 * there, the matcher also has to allow it through (which it does,
 * because the matcher only excludes `_next`, `api`, and
 * `favicon.ico`). The proxy.test.ts asserts the two are aligned.
 *
 * Excluded:
 *  - `_next/*` — Next.js framework assets.
 *  - `api/*`    — Hono catch-all (auth/health/me/etc). They have
 *                 their own 401/403/JSON envelopes and must not be
 *                 coerced into an HTML redirect.
 *  - `favicon.ico` — static asset, not a page.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);
  const isAuthed = !!request.auth;

  if (!isAuthed && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/signin';
    return NextResponse.redirect(url);
  }
  // Pass-through for public paths and authenticated requests.
  return undefined;
});

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
