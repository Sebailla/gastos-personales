/**
 * Auth.js route handler. Mounted at
 * `/api/auth/[...nextauth]/route.ts`. Auth.js handles
 *   - `/api/auth/signin`
 *   - `/api/auth/signout`
 *   - `/api/auth/callback/:provider`
 *   - `/api/auth/session`
 *   - `/api/auth/csrf`
 *   - `/api/auth/providers`
 *   - `/api/auth/verify-request`
 *
 * The handlers are imported from the auth module's public
 * surface (`@/modules/auth`), which re-exports the
 * `NextAuth(authConfig)` destructuring from `authjs.ts`.
 *
 * Rate limiting (R4 W2): the two routes that exercise Argon2id
 * (`/api/auth/callback/credentials` and
 * `/api/auth/register`, which Auth.js handles via
 * `/api/auth/signin/credentials`) are CPU-expensive on the
 * target 1-CPU VM (50-100 ms per attempt). Without a limit, an
 * attacker can probe arbitrary emails at full CPU. We wrap
 * the GET/POST handlers with a path-aware rate-limit gate
 * using Upstash Ratelimit (R4 W2). When Upstash env vars are
 * unset (local dev, CI), the gate is a no-op.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handlers } from '@/modules/auth';
import { assertWithinRateLimit, clientIpFromHeaders, RateLimitError } from '@/shared/rate-limit/rate-limit';

// Paths under `/api/auth/*` that exercise Argon2id and must be
// rate-limited. Kept narrow on purpose: every other Auth.js
// route (csrf, session, providers, signout) is cheap.
const RATE_LIMITED_PATHS = ['/api/auth/callback/credentials', '/api/auth/signin/credentials'] as const;

function shouldRateLimit(pathname: string): boolean {
  return RATE_LIMITED_PATHS.some((p) => pathname.startsWith(p));
}

async function dispatch(
  request: NextRequest,
  handler: (r: NextRequest) => Promise<Response> | Response,
): Promise<Response> {
  const url = new URL(request.url);
  if (shouldRateLimit(url.pathname)) {
    const ip = clientIpFromHeaders(request.headers);
    try {
      await assertWithinRateLimit(`credentials:${ip}`);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' } },
          {
            status: 429,
            headers: { 'retry-after': String(Math.ceil(err.resetMs / 1000)) },
          },
        );
      }
      throw err;
    }
  }
  return handler(request);
}

async function rateLimitedGET(request: NextRequest): Promise<Response> {
  return dispatch(request, handlers.GET);
}

async function rateLimitedPOST(request: NextRequest): Promise<Response> {
  return dispatch(request, handlers.POST);
}

export const { GET, POST } = { GET: rateLimitedGET, POST: rateLimitedPOST };

// Run the route handler in the Node.js runtime, NOT the Edge
// runtime. The default Edge runtime cannot load NAPI binaries
// (e.g. @node-rs/argon2 which authjs.ts transitively imports).
// Forcing the Node runtime avoids a build-time module-not-found
// error on @node-rs/argon2/browser.js.
export const runtime = 'nodejs';
