/**
 * SkipLink — visually hidden until focused, jumps the keyboard user
 * to the page's primary `<main>` landmark.
 *
 * Per REQ-UI-22 (WCAG 2.4.1 Bypass Blocks):
 *   - It MUST be the first focusable element on every page.
 *   - It MUST target `#main-content` (the `<main id="main-content">`
 *     landmark rendered by `<AppShell>` in PR 3).
 *   - It MUST become visible when focused (default Tailwind
 *     `focus:not-sr-only` styling; the link is never permanently
 *     hidden via `display: none` or `visibility: hidden`).
 *
 * Server Component — no event handlers, no state. The mount site
 * (`app/layout.tsx`, T-PR1-08) renders it as the first child of
 * `<body>` so the very first Tab from the address bar lands here.
 */

import type { ReactElement } from 'react';

export interface SkipLinkProps {
  /**
   * Localized visible label. Defaults to a generic English fallback
   * so a caller that forgets to localize still renders something
   * usable; the spec test pins both the `href` and the label shape.
   */
  label?: string;
  /**
   * Anchor target. Defaults to `#main-content`, which matches the
   * `<main id="main-content" tabIndex={-1}>` rendered by
   * `<AppShell>` in PR 3.
   */
  href?: string;
}

const DEFAULT_HREF = '#main-content';
const DEFAULT_LABEL = 'Skip to main content';

export function SkipLink({
  label = DEFAULT_LABEL,
  href = DEFAULT_HREF,
}: SkipLinkProps = {}): ReactElement {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ui-bg focus:text-ui-fg focus:p-3 focus:rounded-ui-md focus:shadow-ui-shadow-lg"
    >
      {label}
    </a>
  );
}
