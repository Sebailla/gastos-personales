// proxy.ts
// Next.js proxy: 302 redirect for unauthenticated App Router pages.
// The Hono /api/me route already returns 401 when the session is
// missing (T-020); this proxy is the faster-fail path for App Router
// pages (e.g. /dashboard).
//
// Public paths (signin, signout, root) are exempted from the redirect
// so that the signin page itself is reachable when not authenticated.
//
// Renamed from middleware.ts in Next.js 16: the file convention is
// now `proxy.ts`. Per the Next.js 16 docs, the proxy always runs in
// the Node.js runtime, so no `runtime` segment config is allowed —
// the older `runtime: 'nodejs'` line that we used to keep Argon2
// off the Edge runtime is no longer needed.
//
// Note: an earlier version of this file matched public paths with
// `pathname.startsWith('/auth/signin')` etc., with `/` included in
// PUBLIC_PATHS. Because every absolute path starts with `/`, that
// made every path "public" and broke the redirect. The check now
// uses exact match for `/` and `startsWith` only for the signin /
// signout prefixes.

import { auth } from '@/modules/auth';
import { NextResponse } from 'next/server';

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname === '/auth/signin' || pathname.startsWith('/auth/signin/')) return true;
  if (pathname === '/auth/signout' || pathname.startsWith('/auth/signout/')) return true;
  return false;
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
  matcher: ['/((?!_next|api/auth|favicon.ico).*)'],
};
