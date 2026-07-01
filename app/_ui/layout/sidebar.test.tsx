// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

const pathnameMock = vi.fn(() => '/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    if (key === 'primary.aria') return 'Navegación principal';
    if (key === 'collapse.aria') return 'Colapsar barra lateral';
    if (key === 'links.dashboard') return 'Panel';
    if (key === 'links.accounts') return 'Cuentas';
    if (key === 'links.transactions') return 'Transacciones';
    return key;
  },
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { Sidebar } from './sidebar';

const STORAGE_KEY = 'ui.sidebarCollapsed';

function installLocalStorageShim(): void {
  const store = new Map<string, string>();
  const shim = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (_i: number) => null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}

describe('Sidebar (T-PR3-03)', () => {
  beforeEach(() => {
    installLocalStorageShim();
    window.history.replaceState(null, '', '/dashboard');
    pathnameMock.mockReturnValue('/dashboard');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function getAside(): HTMLElement {
    // The <aside> and the <nav> inside it both have
    // aria-label="Primary" (so screen-reader rotor sees two
    // landmarks). The <aside> is the outer one (the parent of
    // the <nav>); pick it via the data-component attribute.
    return document.querySelector('[data-component="sidebar"]') as HTMLElement;
  }

  it('renders an <aside> with a <nav aria-label="Primary"> + 3 links', () => {
    render(<Sidebar />);
    const aside = getAside();
    expect(aside).not.toBeNull();
    const nav = aside.querySelector('nav');
    expect(nav).not.toBeNull();
    const links = nav?.querySelectorAll('a') ?? [];
    expect(links.length).toBe(3);
    expect(links[0]?.getAttribute('href')).toBe('/dashboard');
    expect(links[1]?.getAttribute('href')).toBe('/accounts');
    expect(links[2]?.getAttribute('href')).toBe('/transactions');
  });

  it('starts expanded by default', () => {
    render(<Sidebar />);
    const aside = getAside();
    expect(aside.getAttribute('data-collapsed')).toBe('false');
  });

  it('seeds collapsed=true from ?sidebar=collapsed on first load', () => {
    window.history.replaceState(null, '', '/dashboard?sidebar=collapsed');
    render(<Sidebar />);
    const aside = getAside();
    expect(aside.getAttribute('data-collapsed')).toBe('true');
  });

  it('seeds collapsed=true from localStorage on subsequent loads', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true');
    render(<Sidebar />);
    const aside = getAside();
    expect(aside.getAttribute('data-collapsed')).toBe('true');
  });

  it('clicking the toggle flips the data-collapsed state and writes to localStorage + URL', () => {
    render(<Sidebar />);
    const aside = getAside();
    expect(aside.getAttribute('data-collapsed')).toBe('false');

    const toggle = screen.getByTestId('ui-sidebar-toggle');
    act(() => {
      fireEvent.click(toggle);
    });
    expect(aside.getAttribute('data-collapsed')).toBe('true');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(window.location.search).toContain('sidebar=collapsed');

    act(() => {
      fireEvent.click(toggle);
    });
    expect(aside.getAttribute('data-collapsed')).toBe('false');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false');
    expect(window.location.search).not.toContain('sidebar=');
  });

  it('marks the active link with aria-current="page"', () => {
    pathnameMock.mockReturnValue('/accounts/123');
    render(<Sidebar />);
    const aside = getAside();
    const nav = aside.querySelector('nav') as HTMLElement;
    const accountsLink = nav.querySelector('a[href="/accounts"]');
    expect(accountsLink?.getAttribute('aria-current')).toBe('page');
  });

  it('cross-tab sync: a storage event from another tab updates the local state', () => {
    render(<Sidebar />);
    const aside = getAside();
    expect(aside.getAttribute('data-collapsed')).toBe('false');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'true',
          oldValue: 'false',
        }),
      );
    });
    expect(aside.getAttribute('data-collapsed')).toBe('true');
  });
});
