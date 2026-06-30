// proxy.ts
// Next.js proxy — single source of truth for request-time concerns:
//   1. Locale resolution + header injection (REQ-UI-17)
//      Reads the `NEXT_LOCALE` cookie and the `Accept-Language`
//      header, resolves the active locale, and stamps `x-locale` +
//      `x-pathname` on the request so Server Components can read
//      them via `next/headers`. The actual `createMiddleware`
//      dance from next-intl is folded into the same handler so we
//      do NOT need a separate `middleware.ts` (Next.js 16 renamed
//      `middleware.ts` to `proxy.ts` and forbids having both).
//   2. Auth gating (existing behaviour preserved verbatim from
//      the previous proxy.ts): public paths (`/`, `/auth/*`)
//      pass through; everything else requires a session, otherwise
//      307 redirect to `/auth/signin`.
//
// Renamed from middleware.ts in Next.js 16: the file convention
// is now `proxy.ts`. Per the Next.js 16 docs, the proxy always
// runs in the Node.js runtime, so no `runtime` segment config
// is allowed.

import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/modules/auth/nextauth';

import { defaultLocale, locales, type AppLocale } from './i18n';

// ---------------------------------------------------------------------------
// Locale resolution (T-PR1-04 + REQ-UI-17)
// ---------------------------------------------------------------------------

const routing = {
  locales,
  defaultLocale,
  localePrefix: 'as-needed' as const,
};

const intlMiddleware = createMiddleware(routing);

const LOCALE_COOKIE = 'NEXT_LOCALE';
const SUPPORTED: ReadonlySet<string> = new Set(locales);

/**
 * Resolve the active locale for the request per REQ-UI-17.
 *
 * Precedence:
 *   1. `NEXT_LOCALE` cookie if its value is exactly `'en'` or `'es'`.
 *   2. First segment of `Accept-Language` if it starts with `es*`.
 *   3. Default `'en'` (locked proposal Q1).
 */
function resolveLocale(request: NextRequest): AppLocale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && SUPPORTED.has(cookieLocale)) {
    return cookieLocale as AppLocale;
  }

  const acceptLanguage = request.headers.get('accept-language') ?? '';
  const primary = acceptLanguage.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
  if (primary?.startsWith('es')) {
    return 'es';
  }

  return defaultLocale;
}

/**
 * Wraps the next-intl middleware to also stamp `x-locale` and
 * `x-pathname` on the response headers so Server Components can
 * read them via `next/headers` (without depending on next-intl's
 * internal request-locale cache).
 */
function withLocaleHeaders(request: NextRequest): NextResponse {
  const locale = resolveLocale(request);
  const pathname = request.nextUrl.pathname;

  const response = intlMiddleware(request);

  response.headers.set('x-locale', locale);
  response.headers.set('x-pathname', pathname);

  return response;
}

// ---------------------------------------------------------------------------
// Auth gating (preserved from the previous proxy.ts)
// ---------------------------------------------------------------------------

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
      if (pathname === entry.path || pathname.startsWith(`${entry.path}/`)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The Next.js proxy entry point. Chains the locale middleware
 * (which writes `x-locale` and `x-pathname`) with the existing
 * auth gate. The `auth(...)` wrapper from NextAuth v5 first
 * resolves the session, then runs the inner callback which
 * decides whether to redirect. The locale middleware MUST run
 * before the auth gate so the auth-gated pages can also read
 * `x-locale` via `headers().get('x-locale')` (the AppShell
 * reads it for its `<html lang>` and chrome decisions).
 */
export default auth((request) => {
  // (1) Locale headers — always run; do NOT early-return on
  //     unauthenticated requests because the auth signin page
  //     itself needs `x-locale` to render localized copy.
  const localizedResponse = withLocaleHeaders(request as unknown as NextRequest);

  // (2) Auth gate — if the locale middleware issued a redirect
  //     (e.g. the intl prefix negotiation), honour it. Otherwise
  //     apply the auth gating on top of the localized response.
  if (localizedResponse.status >= 300 && localizedResponse.status < 400) {
    return localizedResponse;
  }

  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);
  const isAuthed = !!request.auth;

  if (!isAuthed && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/signin';
    return NextResponse.redirect(url);
  }
  // Pass-through for public paths and authenticated requests.
  return localizedResponse;
});

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
export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
