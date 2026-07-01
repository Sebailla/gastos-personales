'use client';

/**
 * Sidebar — the desktop chrome element (T-PR3-03 of the
 * `ui-redesign` change).
 *
 * Renders a collapsible `<aside>` containing a
 * `<nav aria-label="Primary">` with a `<ul>` of links.
 * Hidden on `< lg` viewports via `hidden lg:block`; the
 * BottomTabBar takes over on mobile.
 *
 * The collapse state round-trips through two sources:
 *
 *   1. URL query parameter `?sidebar=collapsed` — wins on
 *      first load (or after a hard navigation).
 *   2. `localStorage['ui.sidebarCollapsed']` — wins on
 *      subsequent navigations within the same session.
 *
 * Default is expanded. The toggle button updates both
 * sources (URL via `history.replaceState` + localStorage via
 * `setItem`) and re-renders. A `storage` event listener
 * syncs across tabs (open-in-new-tab scenario).
 *
 * Hidden on `< lg` so we don't need a media query in the
 * Sidebar itself — the AppShell decides whether to mount
 * it.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { cx } from '../_shared/cx';

const STORAGE_KEY = 'ui.sidebarCollapsed';
const NAV_ID = 'primary-nav-list';

interface SidebarLink {
  key: string;
  href: string;
  label: string;
}

const LINKS: ReadonlyArray<SidebarLink> = [
  { key: 'dashboard', href: '/dashboard', label: '' },
  { key: 'accounts', href: '/accounts', label: '' },
  { key: 'transactions', href: '/transactions', label: '' },
];

function readCollapsedFromUrl(pathname: string, search: string): boolean | null {
  if (!pathname) return null;
  if (!search) return null;
  const params = new URLSearchParams(search);
  const v = params.get('sidebar');
  if (v === 'collapsed') return true;
  if (v === 'expanded') return false;
  return null;
}

function readCollapsedFromStorage(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeCollapsedToStorage(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // SecurityError (Safari private mode) — silently fall
    // through. The URL source of truth still works.
  }
}

function writeCollapsedToUrl(value: boolean): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (value) {
    url.searchParams.set('sidebar', 'collapsed');
  } else {
    url.searchParams.delete('sidebar');
  }
  window.history.replaceState(null, '', url.toString());
}

// `SidebarProps` is intentionally empty; the Sidebar
// reads all of its state from the URL + localStorage.
// The interface is exported (per `app/_ui/index.ts`)
// for API completeness; consumers that want to override
// the collapse state in the future can extend it
// without a breaking change.
export type SidebarProps = Record<string, never>;

export function Sidebar(_props: SidebarProps = {}): React.JSX.Element {
  const pathname = usePathname() ?? '/';
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations('sidebar');

  // Seed from URL > localStorage > default (expanded) on mount.
  useEffect((): void => {
    const fromUrl = readCollapsedFromUrl(pathname, window.location.search);
    if (fromUrl !== null) {
      setCollapsed(fromUrl);
      writeCollapsedToStorage(fromUrl);
      return;
    }
    const fromStorage = readCollapsedFromStorage();
    if (fromStorage !== null) {
      setCollapsed(fromStorage);
    }
    // Intentional empty deps: we want the URL/storage seed
    // to happen exactly once on mount. Subsequent pathname
    // changes do NOT auto-re-seed (the user has the toggle
    // to change the collapse state explicitly).
  }, []);

  // Cross-tab sync: if the user toggles in another tab,
  // reflect that here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue;
      if (next === 'true') setCollapsed(true);
      else if (next === 'false') setCollapsed(false);
    };
    window.addEventListener('storage', handler);
    return (): void => {
      window.removeEventListener('storage', handler);
    };
  }, []);

  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsedToStorage(next);
    writeCollapsedToUrl(next);
  };

  return (
    <aside
      data-component="sidebar"
      data-collapsed={collapsed}
      aria-label={t('primary.aria')}
      className={cx(
        'hidden lg:block sticky top-14 h-[calc(100dvh-3.5rem)] border-r border-ui-border bg-ui-bg',
        collapsed ? 'w-14' : 'w-64',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={NAV_ID}
        aria-label={t('collapse.aria')}
        data-testid="ui-sidebar-toggle"
        className="flex items-center justify-end w-full px-ui-space-2 py-ui-space-1 text-ui-fg-muted hover:text-ui-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-inset"
      >
        <span aria-hidden="true" className="text-base">
          {collapsed ? '›' : '‹'}
        </span>
      </button>

      <nav aria-label={t('primary.aria')} data-slot="sidebar-nav" className="px-ui-space-1">
        <ul id={NAV_ID} className="flex flex-col gap-ui-space-1">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.key}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  data-key={link.key}
                  title={collapsed ? t(`links.${link.key}`) : undefined}
                  className={cx(
                    'flex items-center min-h-[44px] min-w-[44px] rounded-ui-md px-ui-space-2 py-ui-space-1 text-ui-text-sm',
                    active
                      ? 'bg-ui-accent/10 text-ui-accent font-ui-font-medium'
                      : 'text-ui-fg hover:bg-ui-bg-muted',
                  )}
                >
                  <span className="truncate">{t(`links.${link.key}`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
