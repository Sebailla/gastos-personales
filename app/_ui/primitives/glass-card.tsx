import { type ElementType, type ReactNode } from 'react';

import { cx } from '../_shared/cx';

/**
 * GlassCard — the visual-system card surface (T-PR3-01 of
 * the `ui-redesign` change).
 *
 * Polymorphic primitive that renders a glass surface with
 * a configurable `tone`. The tone picks which `--ui-glass-bg`
 * opacity + blur radius to apply:
 *
 *   - `glass-1` (default): `--ui-glass-bg` +
 *     `--ui-glass-blur-sm` (12px) + `--ui-shadow-glass`
 *   - `glass-2`: same base, but with `--ui-glass-blur-lg`
 *     (20px) for the deeper tier (PR 3 uses this on
 *     landing feature cards and the new chrome)
 *
 * Under `prefers-reduced-transparency: reduce`, the
 * `@media` override in `app/globals.css` (T-PR2-05)
 * replaces the `backdrop-filter` with a high-opacity solid
 * (`--ui-glass-bg-solid`) so the contrast pairings stay
 * ≥ 4.5:1 across the WCAG 2.2 AA boundary.
 *
 * The `as` prop lets consumers pick the semantic tag
 * (`article` for landing feature cards, `section` for
 * landing sections, `div` by default). The component is
 * server-renderable; no client hooks.
 */

export type GlassCardTone = 'glass-1' | 'glass-2';
export type GlassCardAs = 'div' | 'article' | 'section';

const TONE_CLASS: Record<GlassCardTone, string> = {
  'glass-1': 'bg-ui-glass-1 shadow-glass backdrop-blur-[var(--ui-glass-blur-sm)]',
  'glass-2': 'bg-ui-glass-2 shadow-glass backdrop-blur-[var(--ui-glass-blur-lg)]',
};

export interface GlassCardProps {
  children: ReactNode;
  /** Visual tone. Defaults to `glass-1`. */
  tone?: GlassCardTone;
  /** Semantic tag. Defaults to `div`. */
  as?: GlassCardAs;
  /** Optional className override. */
  className?: string;
}

export function GlassCard({
  children,
  tone = 'glass-1',
  as = 'div',
  className,
}: GlassCardProps): React.JSX.Element {
  const Tag: ElementType = as;
  return (
    <Tag
      data-component="glass-card"
      data-tone={tone}
      className={cx('rounded-ui-lg p-ui-space-6 text-ui-fg', TONE_CLASS[tone], className)}
    >
      {children}
    </Tag>
  );
}
