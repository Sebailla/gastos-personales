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
import { describe, expect, it, vi } from 'vitest';

// Mock the next/font/google loaders so the layout renders
// deterministically without booting the Google Fonts download.
vi.mock('next/font/google', () => ({
  Inter: (_options: unknown) => ({
    variable: '__mock_font_inter',
    className: '__mock_class_inter',
    style: { fontFamily: '__inter_family__' },
  }),
  JetBrains_Mono: (_options: unknown) => ({
    variable: '__mock_font_jb_mono',
    className: '__mock_class_jb_mono',
    style: { fontFamily: '__jb_mono_family__' },
  }),
}));

const { SkipLink } = await import('./skip-link');
const RootLayout = (await import('../../layout')).default;

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

describe('SkipLink mounted as first body child (T-PR1-08, REQ-UI-22)', () => {
  it('renders <SkipLink> as the first child of <body>', () => {
    // Arrange + Act — render the root layout with a sentinel child.
    const html = renderToStaticMarkup(
      <RootLayout>
        <span data-sentinel="child" />
      </RootLayout>,
    );

    // Assert — the skip link must come before the page content in
    // document order so the first Tab from the address bar lands
    // on it. The simplest stable assertion: find the `<body>` open
    // tag and the position of the skip link; the link must precede
    // the sentinel span.
    const bodyOpenIndex = html.indexOf('<body');
    const skipLinkIndex = html.indexOf('href="#main-content"');
    const sentinelIndex = html.indexOf('data-sentinel="child"');

    expect(bodyOpenIndex).toBeGreaterThanOrEqual(0);
    expect(skipLinkIndex).toBeGreaterThan(bodyOpenIndex);
    expect(sentinelIndex).toBeGreaterThan(skipLinkIndex);
  });
});
