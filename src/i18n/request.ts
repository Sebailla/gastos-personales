/**
 * Server-side `next-intl` configuration factory.
 *
 * `next-intl` calls `getRequestConfig` once per Server Component
 * render. The factory returns the active locale (read from the
 * `x-locale` request header that `middleware.ts` injects) plus the
 * message catalog for that locale.
 *
 * Source-of-truth ordering (REQ-UI-17):
 *   1. `x-locale` request header — set by `middleware.ts`, which
 *      resolved the locale from `NEXT_LOCALE` cookie → `Accept-Language`
 *      header → default (`'en'`) per the locked proposal Q1.
 *   2. If the header is absent or carries an unsupported value,
 *      fall back to the default locale (`'en'`) so the loader NEVER
 *      throws on a malformed upstream.
 *
 * `next-intl`'s key-fallback behaviour (REQ-UI-24) is configured in
 * `next.config.ts` via `createNextIntlPlugin` — when a key is present
 * in one catalog but missing in the other, the present key is rendered
 * verbatim. This module does not enforce that contract; it only
 * returns the catalog and lets `next-intl` walk it.
 *
 * Imports are static (a `switch` over the locale) so the bundler can
 * tree-shake unused locales and Vite/Vitest can statically resolve the
 * paths. The `import.meta.glob`-style template literal is rejected by
 * Vite's SSR dynamic-import helper.
 */

import { headers } from 'next/headers';
import type { RequestConfig } from 'next-intl/server';

import { defaultLocale, locales, type AppLocale } from '../../i18n';
import enCatalog from '../../messages/en.json';
import esCatalog from '../../messages/es.json';

const SUPPORTED: ReadonlySet<AppLocale> = new Set(locales);

/**
 * Static dispatch over the two supported locales. Extending the locale
 * list requires extending this `switch` and the catalog `import`s.
 */
function loadCatalog(locale: AppLocale): Record<string, unknown> {
  switch (locale) {
    case 'es':
      return esCatalog as Record<string, unknown>;
    case 'en':
      return enCatalog as Record<string, unknown>;
  }
}

function resolveLocale(value: string | undefined): AppLocale {
  if (value && SUPPORTED.has(value as AppLocale)) {
    return value as AppLocale;
  }
  return defaultLocale;
}

/**
 * `next-intl` factory. Reads the `x-locale` header set by the
 * middleware and returns the matching message catalog.
 *
 * Exported as BOTH a named export (`getRequestConfig`,
 * consumed by the `next-intl` runtime via the
 * `createNextIntlPlugin` build-time instrumentation) AND a
 * default export (the legacy `next-intl` Server Component
 * resolution path that some plugin code paths still
 * require). The two exports reference the same function so
 * the behavior is identical.
 */
export async function getRequestConfig(): Promise<RequestConfig> {
  const headerStore = await headers();
  const locale = resolveLocale(headerStore.get('x-locale') ?? undefined);

  return {
    locale,
    messages: loadCatalog(locale),
  };
}

export default getRequestConfig;
