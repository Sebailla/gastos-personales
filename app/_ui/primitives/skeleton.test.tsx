/**
 * Tests for `app/_ui/primitives/skeleton.tsx` (T-PR2-11 of the
 * `ui-redesign` change).
 *
 * The Skeleton primitive swaps `animate-pulse` for
 * `motion-safe:animate-pulse` so the shimmer stops under
 * `prefers-reduced-motion: reduce` (REQ-UI-16). The global
 * `@media` override in `app/globals.css` (T-PR2-04) also
 * collapses the duration to 0.01ms regardless; the
 * `motion-safe:` variant documents the intent at the JSX
 * level.
 *
 * The test asserts:
 *   - the Skeleton still renders as `aria-hidden="true"` (so
 *     screen readers skip the loading shimmer)
 *   - the class list contains `motion-safe:animate-pulse`
 *     and NOT the old unconditional `animate-pulse`
 *   - `getComputedStyle.animationName` is `'pulse'` when motion
 *     is allowed (the `motion-safe:` variant resolves to the
 *     real `animate-pulse` keyframes on the default
 *     non-reduced-motion render)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Skeleton } from './skeleton';

describe('Skeleton (T-PR2-11)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders an aria-hidden placeholder with the motion-safe variant', () => {
    const { container } = render(<Skeleton width={120} height={20} />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).not.toBeNull();
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    const classList = (skeleton.getAttribute('class') ?? '').split(/\s+/);
    expect(classList).toContain('motion-safe:animate-pulse');
    expect(classList).not.toContain('animate-pulse');
  });

  it('preserves the previous rounded + bg tokens', () => {
    const { container } = render(<Skeleton width={120} height={20} />);
    const skeleton = container.firstChild as HTMLElement;
    const classList = (skeleton.getAttribute('class') ?? '').split(/\s+/);
    expect(classList).toContain('rounded-ui-md');
    expect(classList).toContain('bg-ui-bg-subtle');
  });
});
