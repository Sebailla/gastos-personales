// middleware.ts
// Next.js middleware: 302 redirect for unauthenticated App Router
// pages. The Hono /api/me route already returns 401 when the session
// is missing (T-020); this middleware is the faster-fail path for
// App Router pages (e.g. /dashboard).
//
// Public paths (signin, signout, root) are exempted from the redirect
// so that the signin page itself is reachable when not authenticated.

import { auth } from '@/modules/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/auth/signin', '/auth/signout', '/'];

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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
  // Run the middleware in the Node.js runtime, NOT the Edge
  // runtime. The default Edge runtime cannot load NAPI binaries
  // (e.g. @node-rs/argon2 which authjs.ts transitively imports).
  // Forcing the Node runtime avoids a build-time module-not-found
  // error on @node-rs/argon2/browser.js.
  runtime: 'nodejs',
};
