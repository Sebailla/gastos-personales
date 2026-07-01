// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Minimal in-memory `localStorage` shim (matches the pattern
 * from `theme-provider.test.tsx`): the project's vitest
 * config runs `app/_ui/**` tests under jsdom, but jsdom's
 * localStorage is not always available without the
 * `--localstorage-file` flag.
 */
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

function installMatchMediaShim(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

vi.mock('next/navigation', () => ({
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
    if (key === 'brand') return 'gastos-personales';
    if (key === 'userNav.aria') return 'User navigation';
    if (key === 'aria') return 'Cambiar tema de color';
    if (key === 'labels.system') return 'Sistema';
    if (key === 'labels.light') return 'Claro';
    if (key === 'labels.dark') return 'Oscuro';
    if (key === 'popover.aria') return 'Opciones de idioma';
    if (key === 'labels.es') return 'Español';
    if (key === 'labels.en') return 'Inglés';
    return key;
  },
  useLocale: () => 'es',
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => {
    if (key === 'brand') return 'gastos-personales';
    if (key === 'userNav.aria') return 'User navigation';
    return key;
  },
}));

import { Topbar } from './topbar';
import { ThemeProvider } from '../providers/theme-provider';

describe('Topbar (T-PR3-02)', () => {
  beforeEach(() => {
    installLocalStorageShim();
    installMatchMediaShim();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderWithProviders(node: React.ReactNode) {
    return render(<ThemeProvider>{node}</ThemeProvider>);
  }

  it('renders a <header> with a <nav aria-label="User"> and the brand label', async () => {
    const topbar = await Topbar({});
    renderWithProviders(topbar);

    const header = screen.getByRole('banner');
    expect(header).not.toBeNull();
    expect(header.tagName).toBe('HEADER');

    const userNav = screen.getByRole('navigation', { name: 'User navigation' });
    expect(userNav).not.toBeNull();

    // The brand label is in the header
    expect(screen.getByText('gastos-personales')).not.toBeNull();
  });

  it('renders the right slot with the ThemeToggle and LanguageSwitcher', async () => {
    const topbar = await Topbar({});
    renderWithProviders(topbar);

    const userNav = screen.getByRole('navigation', { name: 'User navigation' });
    // The user nav contains the ThemeToggle button (aria-pressed) +
    // the LanguageSwitcher (group with role=group, OR trigger button).
    const themeButton = userNav.querySelector('button[aria-pressed]');
    expect(themeButton).not.toBeNull();
    // The LanguageSwitcher is either a role=group (≥ sm) or a button
    // with aria-haspopup=dialog (< sm). At least one must exist.
    const langSwitcher = userNav.querySelector(
      '[data-testid="ui-language-switcher"], [data-testid="ui-language-switcher-trigger"]',
    );
    expect(langSwitcher).not.toBeNull();
  });
});
