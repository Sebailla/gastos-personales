/**
 * Tests for `app/_ui/primitives/glass-card.tsx` (T-PR3-01 of
 * the `ui-redesign` change).
 *
 * The `GlassCard` primitive picks the glass surface (tone)
 * + the backdrop blur radius. Tone `glass-1` uses the small
 * blur; tone `glass-2` uses the larger blur. The
 * `as` prop lets consumers pick the semantic tag.
 *
 * The runtime check on the rendered class list confirms the
 * `bg-ui-glass-1` (or `bg-ui-glass-2`) +
 * `backdrop-blur-[var(--ui-glass-blur-sm)]` (or `-[lg]`)
 * classes are applied. The reduced-transparency override
 * (T-PR2-05) is covered by `app/_ui/glass-card-css.test.tsx`
 * at the CSS-snapshot level.
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { GlassCard } from './glass-card';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('GlassCard (T-PR3-01)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a <div> by default with the glass-1 tone classes', () => {
    const { container } = render(<GlassCard>content</GlassCard>);
    const card = container.firstChild as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.tagName).toBe('DIV');
    const classAttr = card.getAttribute('class') ?? '';
    expect(classAttr).toMatch(/bg-ui-glass-1/);
    expect(classAttr).toMatch(/shadow-glass/);
    expect(classAttr).toMatch(/backdrop-blur-\[var\(--ui-glass-blur-sm\)\]/);
    expect(card.getAttribute('data-tone')).toBe('glass-1');
  });

  it('uses the larger blur for tone="glass-2"', () => {
    const { container } = render(<GlassCard tone="glass-2">content</GlassCard>);
    const card = container.firstChild as HTMLElement;
    const classAttr = card.getAttribute('class') ?? '';
    expect(classAttr).toMatch(/bg-ui-glass-2/);
    expect(classAttr).toMatch(/backdrop-blur-\[var\(--ui-glass-blur-lg\)\]/);
    // glass-2 should NOT carry the small-blur class.
    expect(classAttr).not.toMatch(/backdrop-blur-\[var\(--ui-glass-blur-sm\)\]/);
    expect(card.getAttribute('data-tone')).toBe('glass-2');
  });

  it('honors the `as` prop (renders an <article> when as="article")', () => {
    const { container } = render(<GlassCard as="article">content</GlassCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.tagName).toBe('ARTICLE');
  });

  it('honors the `as="section"` prop', () => {
    const { container } = render(<GlassCard as="section">content</GlassCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.tagName).toBe('SECTION');
  });

  it('appends a className override to the base class list', () => {
    const { container } = render(<GlassCard className="my-extra-class">content</GlassCard>);
    const card = container.firstChild as HTMLElement;
    const classAttr = card.getAttribute('class') ?? '';
    expect(classAttr).toMatch(/my-extra-class/);
    expect(classAttr).toMatch(/bg-ui-glass-1/);
  });
});
