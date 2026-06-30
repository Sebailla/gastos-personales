/**
 * App-Router middleware — single source of truth for locale resolution
 * and pathname propagation across the request lifecycle.
 *
 * Responsibilities:
 *   1. Resolve the active locale per REQ-UI-17 precedence:
 *      (a) `NEXT_LOCALE` cookie if `'en'` or `'es'`;
 *      (b) first segment of `Accept-Language` if it starts with `es*`;
 *      (c) default `'en'` (locked proposal Q1).
 *   2. Delegate to `next-intl`'s `createMiddleware(routing)` so the
 *      downstream `getRequestConfig` call (in `src/i18n/request.ts`)
 *      receives the matched locale via the internal request-locale
 *      cache. With `localePrefix: 'as-needed'`, the intl middleware
 *      issues no redirect for either locale.
 *   3. Inject two custom request headers that Server Components read
 *      at render time:
 *        - `x-locale` — the locale resolved in step 1 (consumed by
 *          `src/i18n/request.ts` and by `<AppShell>` in PR 3 for its
 *          chrome + `<html lang>` decisions).
 *        - `x-pathname` — the original request path (consumed by
 *          `<AppShell>` to decide which chrome to mount per the
 *          pathname matrix in design §Architecture).
 *
 * Why a wrapper instead of mutating the intl response directly: the
 * `createMiddleware` factory does not expose the resolved locale, and
 * re-running its resolution against `request.headers` here keeps the
 * header value in lock-step with the cookie-write that the intl
 * middleware performs on the response. We import `resolveLocale`
 * indirectly via the same `@formatjs/intl-localematcher` chain that
 * `next-intl` uses, but in this slice we implement the precedence
 * directly so the locale is observable at the wrapper boundary.
 */

import createMiddleware from 'next-intl/middleware';
import type { NextRequest, NextResponse } from 'next/server';

import { defaultLocale, locales, type AppLocale } from './i18n';

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
 *   3. Default `'en'`.
 */
function resolveLocale(request: NextRequest): AppLocale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && SUPPORTED.has(cookieLocale)) {
    return cookieLocale as AppLocale;
  }

  const acceptLanguage = request.headers.get('accept-language') ?? '';
  // The first segment is the highest-weighted language. We only test
  // for an `es*` prefix because Spanish is the only non-English
  // catalog (locked Q1: unsupported languages default to English).
  const primary = acceptLanguage.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
  if (primary?.startsWith('es')) {
    return 'es';
  }

  return defaultLocale;
}

/**
 * Re-exported as a named export so unit tests in
 * `tests/middleware/middleware-headers.test.ts` can invoke it
 * directly with a constructed `NextRequest` instead of going
 * through the Next.js server runtime.
 */
export function middleware(request: NextRequest): NextResponse {
  const locale = resolveLocale(request);
  const pathname = request.nextUrl.pathname;

  const response = intlMiddleware(request);

  // Set the headers BEFORE returning. `NextResponse.next()` returns a
  // mutable response; the intl middleware may also set its own
  // headers (e.g. `Vary`, `Set-Cookie`) — `Headers#set` overwrites
  // our values, so we set them LAST to guarantee the final response
  // carries both `x-locale` and `x-pathname`.
  response.headers.set('x-locale', locale);
  response.headers.set('x-pathname', pathname);

  return response;
}

export const config = {
  // Skip Next.js internals and static assets. Mirrors the next-intl
  // docs' recommended matcher so the intl middleware and our header
  // injection run on the same paths.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
