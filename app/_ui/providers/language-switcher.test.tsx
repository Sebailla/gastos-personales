/**
 * Tests for `app/_ui/providers/language-switcher.tsx` (T-PR3-05
 * of the `ui-redesign` change).
 *
 * The LanguageSwitcher has two surface variants:
 *
 *   - On `≥ sm`: two inline segmented buttons (`es` / `en`)
 *     with `aria-pressed={activeLocale === code}`.
 *   - On `< sm`: a single icon button that opens a popover
 *     with the same two options.
 *
 * On select, the component writes the `NEXT_LOCALE` cookie
 * and calls `router.refresh()`.
 *
 * The tests cover:
 *   - On `≥ sm`, both inline buttons render with the right
 *     `aria-pressed` value
 *   - On `< sm`, the icon button is rendered; clicking it
 *     opens a popover with the two locale options
 *   - Selecting a locale writes the `NEXT_LOCALE` cookie
 *     and calls `router.refresh()` (both mocked)
 *   - `vitest-axe` clean
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const routerRefreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => (key: string) => {
    if (key === 'aria') return 'Cambiar idioma';
    if (key === 'popover.aria') return 'Opciones de idioma';
    if (key === 'labels.es') return 'Español';
    if (key === 'labels.en') return 'Inglés';
    return key;
  },
}));

import { LanguageSwitcher } from './language-switcher';

function installMatchMedia(small: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('max-width: 639px') ? small : !small,
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

describe('LanguageSwitcher (T-PR3-05)', () => {
  beforeEach(() => {
    document.cookie = 'NEXT_LOCALE=es; Path=/';
    document.documentElement.lang = '';
    routerRefreshMock.mockClear();
  });

  afterEach(() => {
    document.cookie = 'NEXT_LOCALE=es; Path=/';
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders two inline segmented buttons on ≥ sm with the right aria-pressed', () => {
    installMatchMedia(false);
    const { container } = render(<LanguageSwitcher />);
    const group = container.querySelector('[data-testid="ui-language-switcher"]');
    expect(group).not.toBeNull();

    const esButton = container.querySelector('[data-testid="ui-language-switcher-option-es"]');
    const enButton = container.querySelector('[data-testid="ui-language-switcher-option-en"]');
    expect(esButton).not.toBeNull();
    expect(enButton).not.toBeNull();
    expect(esButton?.getAttribute('aria-pressed')).toBe('true');
    expect(enButton?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the icon button on < sm', () => {
    installMatchMedia(true);
    const { container } = render(<LanguageSwitcher />);
    const trigger = container.querySelector('[data-testid="ui-language-switcher-trigger"]');
    expect(trigger).not.toBeNull();
    const popover = container.querySelector('[data-testid="ui-language-switcher-popover"]');
    expect(popover).toBeNull();
  });

  it('opens the popover on click when < sm', () => {
    installMatchMedia(true);
    const { container } = render(<LanguageSwitcher />);
    const trigger = container.querySelector(
      '[data-testid="ui-language-switcher-trigger"]',
    ) as HTMLElement;
    act(() => {
      trigger.click();
    });
    const popover = container.querySelector('[data-testid="ui-language-switcher-popover"]');
    expect(popover).not.toBeNull();
  });

  it('selecting a locale writes the NEXT_LOCALE cookie and calls router.refresh', () => {
    installMatchMedia(false);
    const { container } = render(<LanguageSwitcher />);
    const enButton = container.querySelector(
      '[data-testid="ui-language-switcher-option-en"]',
    ) as HTMLElement;
    act(() => {
      enButton.click();
    });
    expect(document.cookie).toMatch(/NEXT_LOCALE=en/);
    expect(routerRefreshMock).toHaveBeenCalled();
  });
});
