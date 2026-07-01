import { type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { LanguageSwitcher } from '../providers/language-switcher';
import { ThemeToggle } from '../providers/theme-toggle';

/**
 * Topbar — the horizontal chrome element (T-PR3-02 of the
 * `ui-redesign` change).
 *
 * Renders a single `<header>` with three flex-row slots
 * (left = brand label, center = page-context placeholder,
 * right = `<ThemeToggle/>` + `<LanguageSwitcher/>`). The
 * right slot is wrapped in a `<nav aria-label="User">` so
 * screen-reader rotor users land on a sensible landmark.
 *
 * The Topbar is always rendered on the landing and authed
 * routes; the AppShell (T-PR3-06) decides whether to also
 * render the Sidebar (≥ `lg`) or the BottomTabBar (< `lg`).
 *
 * Server-renderable; the right slot's two Client
 * Components hydrate on the client. The brand label is
 * resolved via `getTranslations('topbar')` (Server
 * Component form of next-intl).
 *
 * 56 px mobile-first height with `safe-area-inset-top`
 * padding for iOS.
 */

export interface TopbarProps {
  /**
   * Optional content for the center slot. PR 4 will use this
   * for the landing hero's context; the chrome leaves it
   * empty otherwise.
   */
  center?: ReactNode;
}

export async function Topbar({ center }: TopbarProps): Promise<React.JSX.Element> {
  const t = await getTranslations('topbar');

  return (
    <header
      data-component="topbar"
      className="sticky top-0 z-40 w-full border-b border-ui-border bg-ui-bg/80 backdrop-blur-[var(--ui-glass-blur-sm)] h-14 flex items-center justify-between px-ui-space-4 safe-top"
    >
      <div data-slot="left" className="flex items-center gap-ui-space-2 min-w-0">
        <span className="font-ui-font-semibold text-ui-text-sm text-ui-fg truncate">
          {t('brand')}
        </span>
      </div>

      <div data-slot="center" className="flex-1 px-ui-space-4 min-w-0">
        {center ?? null}
      </div>

      <nav
        aria-label={t('userNav.aria')}
        data-slot="right"
        className="flex items-center gap-ui-space-2 shrink-0"
      >
        <ThemeToggle />
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
