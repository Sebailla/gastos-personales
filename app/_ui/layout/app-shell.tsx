import { type ReactNode } from 'react';
import { headers } from 'next/headers';

import { BottomTabBar } from './bottom-tab-bar';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/**
 * AppShell — the chrome orchestrator (T-PR3-06 of the
 * `ui-redesign` change).
 *
 * Reads the `x-pathname` + `x-locale` request headers (set
 * by `proxy.ts` in PR 1) and decides which chrome elements
 * to mount per the design §Architecture pathname matrix:
 *
 *   - `/` (landing)                → Topbar only
 *   - `/auth/*`                    → no chrome
 *   - `/dashboard`, `/accounts/*`, `/transactions/*` → full
 *                                  chrome (Topbar + Sidebar
 *                                  at ≥ lg, BottomTabBar at
 *                                  < lg; Sidebar/BottomTabBar
 *                                  pick the breakpoint via
 *                                  Tailwind's `hidden lg:block`
 *                                  and `lg:hidden` utilities)
 *   - not-found, error, any other → Topbar only
 *
 * Wraps `children` in `<main id="main-content" tabIndex={-1}>`
 * which is the skip-link target (the `<SkipLink href="#main-content">`
 * mounted in the root layout jumps here on Tab focus).
 *
 * Server Component; no client hooks. The Sidebar is a
 * Client Component (hydration) but it can be rendered as
 * a child of a Server Component.
 */

type ChromeVariant = 'topbar-only' | 'full' | 'none';

/**
 * Pure function that picks the chrome variant for a
 * pathname. Exported (per `app/_ui/index.ts`) so the
 * unit test can pin the matrix without booting a full
 * Server Component render. The matrix itself is the
 * authoritative spec; the AppShell JSX is just a
 * side-effect-free projection of `pickChromeVariant` +
 * the active pathname.
 */
export function pickChromeVariant(pathname: string): ChromeVariant {
  if (pathname === '/' || pathname === '') {
    return 'topbar-only';
  }
  if (pathname.startsWith('/auth/')) {
    return 'none';
  }
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/accounts' ||
    pathname.startsWith('/accounts/') ||
    pathname === '/transactions' ||
    pathname.startsWith('/transactions/')
  ) {
    return 'full';
  }
  // not-found, error, or any other pathname
  return 'topbar-only';
}

export interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps): Promise<React.JSX.Element> {
  const headerList = await headers();
  const xPathname = headerList.get('x-pathname') ?? '/';
  const variant = pickChromeVariant(xPathname);

  return (
    <>
      {variant !== 'none' ? <Topbar /> : null}
      <div
        data-component="app-shell"
        data-chrome={variant}
        data-pathname={xPathname}
        className={
          variant === 'full' ? 'flex min-h-[calc(100dvh-3.5rem)]' : 'min-h-[calc(100dvh-3.5rem)]'
        }
      >
        {variant === 'full' ? <Sidebar /> : null}
        <main
          id="main-content"
          tabIndex={-1}
          data-component="main"
          className="flex-1 focus:outline-none"
        >
          {children}
        </main>
        {variant === 'full' ? <BottomTabBar activePathname={xPathname} /> : null}
      </div>
    </>
  );
}
