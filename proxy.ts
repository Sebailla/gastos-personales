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
 * Build the Next.js proxy matcher from PUBLIC_PATHS. Excludes
 * `_next`, the entire `/api` tree, and `favicon.ico` so Hono API
 * routes and framework assets are not evaluated by the redirect.
 */
function buildMatcher(): string {
  // Exclude /api entirely (Hono catch-all at app/api/[...path]/route.ts).
  // Auth.js's own /api/auth/* endpoints return their own responses
  // and must not be redirected either.
  return '/((?!_next|api|favicon.ico).*)';
}

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
  matcher: [buildMatcher()],
};
