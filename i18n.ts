/**
 * i18n routing configuration — single source of truth for the locales
 * the application supports.
 *
 * Consumed by:
 * - `next-intl/middleware` (`middleware.ts`) — `createMiddleware(routing)`
 * - `src/i18n/request.ts` — uses `locales` + `defaultLocale` to type the
 *   message catalog loader
 * - Server Components — `getRequestConfig` and `getTranslations` rely on
 *   these constants to narrow the locale string to the `AppLocale` union
 *
 * Locked decisions reflected here:
 * - Two locales only (`en`, `es`) per REQ-UI-17.
 * - `defaultLocale: 'en'` per proposal Q1 — browsers whose
 *   `Accept-Language` is neither Spanish nor English default to English.
 * - `localePrefix: 'as-needed'` — no `/en/...` URL prefix; the locale
 *   resolution is cookie + `Accept-Language` header driven via the
 *   middleware. The default locale's paths do not carry a prefix.
 */

export const locales = ['en', 'es'] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = 'en';

/**
 * `as-needed` — the default locale (`en`) is served at unprefixed
 * paths (`/dashboard`); non-default locales get a prefix (`/es/...`).
 * Slice 1 uses the default-locale path exclusively; non-default locale
 * prefixing is reserved for the i18n hardening slice.
 */
export const localePrefix = 'as-needed' as const;
