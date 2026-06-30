import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { SkipLink } from './_ui/layout/skip-link';

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

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        {/* REQ-UI-22 — first focusable element on every page.
            The `<main id="main-content">` target lands in PR 3
            with `<AppShell>`; for PR 1 the link's href resolves
            to a non-existing anchor, which is fine — a static
            href is the spec. */}
        <SkipLink label="Skip to main content" />
        {children}
      </body>
    </html>
  );
}
