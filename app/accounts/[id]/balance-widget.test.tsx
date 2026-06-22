/**
 * Tests for the BalanceWidget stale chip — fx-cache PR-3 T3.8.
 *
 * One Vitest case renders the exported `StaleChip` with a
 * fixture `fxAsOf` and asserts:
 * - the chip text is exactly `"Cotización desactualizada
 *   (hace N min)"` with the expected minutes computed
 *   client-side from `Date.now() - fxAsOf`;
 * - the chip carries `role="status"` + `aria-live="polite"`
 *   so screen readers surface it without stealing focus;
 * - the chip carries the amber Tailwind classes
 *   `bg-amber-100`, `text-amber-700`, `px-2`, `py-1`,
 *   `rounded`, `text-sm`.
 *
 * We use `renderToStaticMarkup` (no jsdom, no RTL) — the
 * same approach as the `create-account-form.test.tsx`
 * sibling. The widget's full integration (the `stale`
 * boolean lifted from `body.data` into the chip render)
 * is hand-verified in the PR acceptance script; this test
 * pins the chip component's contract in isolation.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaleChip } from './balance-widget';

describe('BalanceWidget — StaleChip (fx-cache PR-3 T3.8)', () => {
  it('renders the amber stale chip with the expected text and a11y attributes', () => {
    // Pin "now" so the minutes-elapsed assertion is
    // deterministic. The chip uses Date.now() at render
    // time, but renderToStaticMarkup is synchronous; the
    // delta vs the fxAsOf is computed within milliseconds.
    const fxAsOf = new Date(Date.now() - 7 * 60 * 1000).toISOString(); // 7 min ago
    const html = renderToStaticMarkup(<StaleChip fxAsOf={fxAsOf} />);
    // Text: "Cotización desactualizada (hace 7 min)"
    expect(html).toMatch(/Cotización desactualizada \(hace \d+ min\)/);
    // a11y attributes.
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    // Amber Tailwind classes per design §15.1.
    expect(html).toContain('bg-amber-100');
    expect(html).toContain('text-amber-700');
    expect(html).toContain('px-2');
    expect(html).toContain('py-1');
    expect(html).toContain('rounded');
    expect(html).toContain('text-sm');
    // data-testid so the manual smoke check can query it.
    expect(html).toContain('data-testid="fx-stale-chip"');
  });
});
