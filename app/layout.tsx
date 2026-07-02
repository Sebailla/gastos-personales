import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AppShell } from './_ui/layout/app-shell';
import { SkipLink } from './_ui/layout/skip-link';
import { ThemeProvider } from './_ui/providers/theme-provider';

import './globals.css';

// Inter Variable (REQ-UI-18) — display + body text. `weight: 'variable'`
// emits the variable-font subset; `display: 'swap'` keeps first
// paint unblocked; `preload: true` is the LCP contribution.
// The `variable` option writes the loader's CSS variable name onto
// the consumer element so `--font-inter` becomes available in scope.
const inter = Inter({
  weight: 'variable',
  display: 'swap',
  preload: true,
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext'],
});

// JetBrains Mono — monospace. Two weights (400 + 500) match the
// existing form / table consumption in `app/_ui/primitives/`.
const jetbrainsMono = JetBrains_Mono({
  weight: ['400', '500'],
  display: 'swap',
  preload: true,
  variable: '--font-jb-mono',
  subsets: ['latin', 'latin-ext'],
});

export const metadata: Metadata = {
  title: 'gastos-personales',
  description: 'Multi-user personal finance app',
};

/**
 * Inline blocking FOUC script (T-PR2-07 of the `ui-redesign`
 * change, REQ-UI-14).
 *
 * Runs before first paint (no `defer`, no `async`) with one
 * job: read the active theme from the same precedence the
 * `ThemeProvider` uses (`ui.theme` localStorage → OS
 * `prefers-color-scheme` → default `light`) and add the
 * `dark` class to `document.documentElement` so the dark-scope
 * CSS in `app/_ui/tokens.css` (T-PR2-02) applies before the
 * first frame. Without this script, a user with
 * `mode === 'system'` and OS-level dark preference would see
 * a flash of the light theme (FOUC) on every page load.
 *
 * The whole body is wrapped in `try/catch` so a
 * `SecurityError` from `localStorage` (Safari private mode,
 * third-party-cookie-blocking browsers) does not break the
 * page. The script is plain JavaScript — no React, no
 * hydration. CSP already permits inline scripts
 * (`script-src 'self' 'unsafe-inline'` in `next.config.ts`).
 */
const themeBootstrapScript = `(function(){try{var s=localStorage.getItem('ui.theme');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList[d?'add':'remove']('dark');}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.JSX.Element> {
  // PR 3 (T-PR3-07) — read the active locale from the
  // `x-locale` request header (set by `proxy.ts` in PR 1) so
  // the `<html lang>` attribute matches the active next-intl
  // locale. The header is `null` on the very first request
  // (before the proxy writes it) and on static prerender;
  // we fall back to `'en'` in that case.
  const headerList = await headers();
  const xLocale = headerList.get('x-locale');
  const htmlLang: 'en' | 'es' = xLocale === 'es' ? 'es' : 'en';

  // Load the message catalog for the active locale so the
  // `<NextIntlClientProvider>` can hand it to Client Components
  // that call `useTranslations()` / `useLocale()` (e.g.
  // `LanguageSwitcher`, `Sidebar`). Without this provider the
  // client-side hooks throw "No intl context found" at
  // runtime — REQ-UI-17 (i18n scaffold, PR #110) wired the
  // server config but the client provider was never wrapped
  // in this layout.
  const messages = await getMessages();

  return (
    <html lang={htmlLang} className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        {/* REQ-UI-22 — first focusable element on every page. The
            `<main id="main-content">` target is mounted by
            `<AppShell>` (T-PR3-06) below. */}
        <SkipLink label="Skip to main content" />
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
