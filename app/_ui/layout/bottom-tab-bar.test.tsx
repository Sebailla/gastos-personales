// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    if (key === 'primary.aria') return 'Navegación principal';
    if (key === 'links.dashboard') return 'Panel';
    if (key === 'links.accounts') return 'Cuentas';
    if (key === 'links.transactions') return 'Transacciones';
    if (key === 'links.reserved1') return 'Reportes';
    if (key === 'links.reserved2') return 'Ajustes';
    return key;
  },
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => {
    if (key === 'primary.aria') return 'Navegación principal';
    if (key === 'links.dashboard') return 'Panel';
    if (key === 'links.accounts') return 'Cuentas';
    if (key === 'links.transactions') return 'Transacciones';
    if (key === 'links.reserved1') return 'Reportes';
    if (key === 'links.reserved2') return 'Ajustes';
    return key;
  },
}));

import { BottomTabBar } from './bottom-tab-bar';

describe('BottomTabBar (T-PR3-04)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a <nav aria-label="Primary"> with 5 destinations', async () => {
    const tabBar = await BottomTabBar({ activePathname: '/dashboard' });
    render(tabBar);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(nav).not.toBeNull();
    // The <ul> inside has 5 <li> items.
    const items = nav.querySelectorAll('li');
    expect(items.length).toBe(5);
  });

  it('marks the active link with aria-current="page" for /dashboard', async () => {
    const tabBar = await BottomTabBar({ activePathname: '/dashboard' });
    render(tabBar);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const dashboardLink = nav.querySelector('a[href="/dashboard"]');
    expect(dashboardLink).not.toBeNull();
    expect(dashboardLink?.getAttribute('aria-current')).toBe('page');
  });

  it('marks the reserved slots with aria-disabled="true" and data-reserved="true"', async () => {
    const tabBar = await BottomTabBar({ activePathname: '/dashboard' });
    render(tabBar);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const reserved = nav.querySelectorAll('[data-reserved="true"]');
    expect(reserved.length).toBe(2);
    expect(reserved[0]?.getAttribute('aria-disabled')).toBe('true');
    expect(reserved[1]?.getAttribute('aria-disabled')).toBe('true');
  });

  it('active link matches a nested path (e.g. /accounts/123)', async () => {
    const tabBar = await BottomTabBar({ activePathname: '/accounts/123' });
    render(tabBar);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const accountsLink = nav.querySelector('a[href="/accounts"]');
    expect(accountsLink).not.toBeNull();
    expect(accountsLink?.getAttribute('aria-current')).toBe('page');
  });
});
