'use client';

/**
 * Spinner primitive — inline SVG with `role="status"` and
 * `aria-label` (default "Loading"). CSS-only animation: the
 * `motion-safe:animate-spin` Tailwind utility rotates the
 * ring; no JS loop.
 *
 * `ui-redesign` (PR 2) changes:
 *   - `animate-spin` → `motion-safe:animate-spin` so the
 *     ring stops animating under
 *     `prefers-reduced-motion: reduce` (REQ-UI-16). The
 *     global `@media` override in `app/globals.css`
 *     (T-PR2-04) also collapses the duration to 0.01ms
 *     regardless; the `motion-safe:` variant documents the
 *     intent at the JSX level so a future refactor that
 *     drops the global override does not silently regress
 *     reduced-motion users.
 *   - When the user has `prefers-reduced-motion: reduce`
 *     set, the Spinner renders the literal "Cargando…" /
 *     "Loading…" text (resolved via
 *     `useTranslations('spinner')` from `next-intl`, the
 *     i18n scaffold from PR 1) so the loading state is
 *     still announced by screen readers even when the ring
 *     is visually still.
 *
 * The component is now a Client Component because it
 * subscribes to `matchMedia` and uses the `next-intl`
 * `useTranslations` hook. The class attribute is computed
 * in render to keep the `motion-safe:` variant
 * declarative.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface SpinnerProps {
  /** Accessible label for the loading state. Defaults to "Loading". */
  'aria-label'?: string;
  /** Visual size in pixels. Defaults to 20. */
  size?: number;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

export function Spinner({
  'aria-label': ariaLabel = 'Loading',
  size = 20,
}: SpinnerProps): React.JSX.Element {
  const reduced = usePrefersReducedMotion();
  const t = useTranslations('spinner');
  const fallbackText = t('loading');

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
      data-testid="ui-spinner"
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="motion-safe:animate-spin text-ui-accent shrink-0"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {reduced ? (
        <span data-testid="ui-spinner-fallback" className="text-ui-text-sm text-ui-fg-muted">
          {fallbackText}
        </span>
      ) : null}
    </span>
  );
}
