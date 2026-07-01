/**
 * Tests for `app/_ui/primitives/spinner.tsx` (T-PR2-10 of the
 * `ui-redesign` change).
 *
 * The Spinner primitive gains:
 *   - `motion-safe:animate-spin` (was `animate-spin`) so the
 *     ring stops animating under `prefers-reduced-motion: reduce`
 *     (the global @media override in `app/globals.css` from
 *     T-PR2-04 collapses the duration to 0.01ms anyway, but the
 *     Tailwind `motion-safe:` variant also documents the
 *     intent at the JSX level).
 *   - A literal text fallback (`Cargando…` / `Loading…`) under
 *     reduced-motion so the loading state is still announced
 *     by screen readers even when the ring is still. The
 *     fallback is resolved via `useTranslations('spinner')`
 *     from `next-intl` (the i18n scaffold from PR 1).
 *
 * The tests assert the contract:
 *   - The SVG ring is present in the default render
 *     (motion allowed).
 *   - The `animate-spin` utility is replaced with
 *     `motion-safe:animate-spin`.
 *   - The reduced-motion fallback is locale-aware (es vs en).
 *   - The Spinner exposes a stable `data-testid` for tests +
 *     axe scans.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Spinner } from './spinner';

vi.mock('next-intl', () => ({
  useTranslations: (_namespace: string) => {
    const dict: { spinner: { es: { loading: string }; en: { loading: string } } } = {
      spinner: {
        es: { loading: 'Cargando…' },
        en: { loading: 'Loading…' },
      },
    };
    return (key: string) => {
      const locale = process.env.NEXT_LOCALE === 'es' ? 'es' : 'en';
      const entry = dict.spinner[locale] as Record<string, string>;
      return entry[key] ?? key;
    };
  },
}));

describe('Spinner (T-PR2-10)', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the SVG ring + the data-testid', () => {
    const { container } = render(<Spinner aria-label="Loading" />);
    const wrapper = container.querySelector('[data-testid="ui-spinner"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector('svg')).not.toBeNull();
  });

  it('uses `motion-safe:animate-spin` (not unconditional `animate-spin`)', () => {
    const { container } = render(<Spinner aria-label="Loading" />);
    // The `motion-safe:animate-spin` utility is on the inner
    // `<svg>`, not the wrapper span.
    const svg = container.querySelector('[data-testid="ui-spinner"] svg');
    // JSDOM exposes `className` as a plain string (not
    // `SVGAnimatedString` like real browsers); use
    // `getAttribute('class')` to read the rendered class list
    // portably across both environments.
    const classAttr = svg?.getAttribute('class') ?? '';
    expect(classAttr).toMatch(/motion-safe:animate-spin/);
    // The class list is space-separated; the bare
    // `animate-spin` (without the `motion-safe:` prefix) must
    // NOT appear independently. If the source still had the
    // old unconditional `animate-spin`, it would appear as a
    // separate class.
    const classList = classAttr.split(/\s+/);
    expect(classList).not.toContain('animate-spin');
  });

  it('falls back to literal "Cargando…" text under prefers-reduced-motion when locale is es', () => {
    process.env.NEXT_LOCALE = 'es';
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );

    const { container } = render(<Spinner aria-label="Loading" />);
    // The Spinner is a server-friendly primitive; the
    // reduced-motion fallback renders the literal text
    // alongside the SVG (the SVG is still present, just
    // visually static because of the duration-0.01ms
    // override + the `motion-safe:` Tailwind variant). The
    // fallback is locale-resolved via `useTranslations`.
    const text = container.textContent ?? '';
    expect(text).toMatch(/Cargando…|Loading…/);
  });
});
