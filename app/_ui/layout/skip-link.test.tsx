/**
 * RED → GREEN coverage for `app/_ui/layout/skip-link.tsx`.
 *
 * REQ-UI-22 mandates a skip-to-content link that:
 *   - is the first focusable element on every page;
 *   - targets the page's `<main>` landmark (`#main-content`);
 *   - becomes visible when focused (the link must NOT be permanently
 *     hidden via `display: none` or `visibility: hidden`).
 *
 * The component is a Server Component per design §Component surface
 * (`app/_ui/layout/skip-link.tsx`) — no `'use client'`. The test
 * asserts the static HTML shape; axe-clean is verified in the
 * integration test added with `<AppShell>` in PR 3.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const { SkipLink } = await import('./skip-link');

function render(label: string): string {
  return renderToStaticMarkup(<SkipLink label={label} />);
}

describe('SkipLink (REQ-UI-22)', () => {
  it('renders an anchor targeting #main-content by default', () => {
    // Arrange + Act
    const html = render('Skip to main content');

    // Assert
    expect(html).toContain('href="#main-content"');
  });

  it('renders the localized label verbatim as the link text', () => {
    // Arrange + Act
    const html = render('Saltar al contenido principal');

    // Assert
    expect(html).toContain('Saltar al contenido principal');
  });

  it('renders as visually hidden until focused (sr-only focus:not-sr-only)', () => {
    // Arrange + Act
    const html = render('Skip');

    // Assert — the `sr-only` + `focus:not-sr-only` utility pair is
    // what gives the WCAG 2.4.1 Bypass Blocks behavior. Asserting
    // the literal class names pins the contract: a future refactor
    // that drops `sr-only` (hiding the link permanently) or
    // `focus:not-sr-only` (preventing the visible-on-focus state)
    // breaks this test.
    expect(html).toContain('sr-only');
    expect(html).toContain('focus:not-sr-only');
  });

  it('honors a custom href when one is provided', () => {
    // Arrange + Act — render the component with an explicit href
    // so a future caller can target a different landmark (the
    // AppShell's `<main id="main-content">` is the default target,
    // but e.g. a settings page with a sub-landmark can opt out).
    const html = renderToStaticMarkup(<SkipLink label="Skip" href="#primary-nav" />);

    // Assert
    expect(html).toContain('href="#primary-nav"');
  });
});
