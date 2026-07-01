import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { cx } from '../_shared/cx';

/**
 * BottomTabBar — the mobile-only chrome element (T-PR3-04 of
 * the `ui-redesign` change).
 *
 * Fixed at the bottom of the viewport on viewports below
 * Tailwind's `lg` breakpoint (`lg:hidden`); above `lg` the
 * Sidebar takes over. Renders a single `<nav aria-label="Primary">`
 * with 5 destinations:
 *
 *   - 3 active:  Dashboard, Accounts, Transactions
 *   - 2 reserved: Reports, Settings (rendered as
 *     \`aria-disabled="true"\` placeholders so the visual
 *     layout is final for slice 1; the routes are wired in
 *     their own follow-up SDD changes)
 *
 * Each destination is a touch target ≥ 44×44 px
 * (WCAG 2.2 AA / Apple HIG / Material Design baseline)
 * via \`min-h-[44px] min-w-[44px]\`.
 *
 * \`safe-area-inset-bottom\` padding accommodates iOS devices
 * with home-indicator gestures.
 *
 * Server-renderable; the active-link state is computed at
 * render time via the resolved pathname (the AppShell passes
 * the pathname down via the \`activePathname\` prop).
 */

interface BottomTabBarDestination {
  key: string;
  href: string;
  label: string;
  active: boolean;
  reserved?: boolean;
}

export interface BottomTabBarProps {
  activePathname: string;
}

const ACTIVE_HREFS: ReadonlyArray<{ key: string; href: string }> = [
  { key: 'dashboard', href: '/dashboard' },
  { key: 'accounts', href: '/accounts' },
  { key: 'transactions', href: '/transactions' },
];

const RESERVED_HREFS: ReadonlyArray<{ key: string }> = [{ key: 'reserved1' }, { key: 'reserved2' }];

export async function BottomTabBar({
  activePathname,
}: BottomTabBarProps): Promise<React.JSX.Element> {
  const t = await getTranslations('bottomTabBar');

  const destinations: ReadonlyArray<BottomTabBarDestination> = [
    ...ACTIVE_HREFS.map(({ key, href }) => ({
      key,
      href,
      label: t(`links.${key}`),
      active: activePathname === href || activePathname.startsWith(`${href}/`),
    })),
    ...RESERVED_HREFS.map(({ key }) => ({
      key,
      href: '#',
      label: t(`links.${key}`),
      active: false,
      reserved: true,
    })),
  ];

  return (
    <nav
      aria-label={t('primary.aria')}
      data-component="bottom-tab-bar"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-ui-border bg-ui-bg/95 backdrop-blur-[var(--ui-glass-blur-sm)] safe-bottom"
    >
      <ul
        id="primary-nav-bottom"
        className="flex items-stretch justify-around px-ui-space-1 py-ui-space-1"
      >
        {destinations.map((dest) => {
          const baseClasses =
            'flex-1 flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-ui-space-1 py-ui-space-1 text-ui-text-xs rounded-ui-md';
          const stateClasses = dest.reserved
            ? 'text-ui-fg-muted opacity-50 cursor-not-allowed'
            : dest.active
              ? 'text-ui-accent font-ui-font-medium'
              : 'text-ui-fg-muted hover:bg-ui-bg-muted';

          return (
            <li key={dest.key} className="flex-1">
              {dest.reserved ? (
                <span
                  aria-disabled="true"
                  data-key={dest.key}
                  data-reserved="true"
                  className={cx(baseClasses, stateClasses)}
                >
                  {dest.label}
                </span>
              ) : (
                <Link
                  href={dest.href}
                  aria-current={dest.active ? 'page' : undefined}
                  data-key={dest.key}
                  className={cx(baseClasses, stateClasses)}
                >
                  {dest.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
