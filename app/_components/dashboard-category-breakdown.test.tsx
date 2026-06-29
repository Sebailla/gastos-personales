/**
 * Tests for `CategoryBreakdownCard` — dashboard-ui slice 4
 * (T-UI-307, originally T-RPT-304).
 *
 * Snapshot tests. Three cases:
 *
 *   1. Empty state: `buckets: []` → renders an `EmptyState`
 *      (per design §7.3 + REQ-UI-3); the "Sin datos" surface
 *      still ships for backward compatibility with the slice
 *      1 + 2 + 3 page tests that grep for the literal string.
 *   2. Populated state: three buckets — assert the rows
 *      render in the order the fixture provides (descending
 *      by `amountMinor`). The fixture pre-sorts because the
 *      domain factory already sorts (BR-RPT-2); the test
 *      asserts the render does NOT re-sort or permute.
 *   3. Card surface present (Card primitive compound renders
 *      `<article>`).
 *
 * Per slice 4's redesign (design §7.3): the card is now a
 * Card primitive compound (Card + CardHeader + CardBody)
 * consuming the Table primitive for the bucket rows and the
 * EmptyState primitive for the empty branch.
 *
 * No logic in tests (root AGENTS.md §10.5): fixtures are
 * hand-written, the assertions are direct `toContain` checks.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CategoryBreakdownDTO } from '../_lib/report-types';
import { CategoryBreakdownCard } from './dashboard-category-breakdown';

describe('CategoryBreakdownCard (slice 4 T-UI-307)', () => {
  it('renders the empty state via EmptyState + sin-datos sentinel', () => {
    const empty: CategoryBreakdownDTO = {
      buckets: [],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    const html = renderToStaticMarkup(
      <CategoryBreakdownCard breakdown={empty} month="2026-06" />,
    );
    // Card compound + CardHeader title.
    expect(html).toContain('<article');
    expect(html).toContain('Por categoría');
    expect(html).toContain('2026-06');
    expect(html).toContain('(UTC)');
    // EmptyState sentinel.
    expect(html).toContain('role="status"');
    expect(html).toContain('Sin datos');
  });

  it('renders the populated state as a Table primitive sorted DESC by amountMinor', () => {
    // The fixture mirrors the post-sort shape the domain
    // factory produces (BR-RPT-2 sort: amountMinor DESC,
    // categoryNormalized ASC secondary). The component
    // trusts the sort and renders rows in input order — the
    // assertion is on the ORDER, not the absolute amounts.
    const breakdown: CategoryBreakdownDTO = {
      buckets: [
        {
          category: 'Food',
          categoryNormalized: 'food',
          convertedCurrency: 'ARS',
          amountMinor: 50000,
          txCount: 12,
        },
        {
          category: 'Transport',
          categoryNormalized: 'transport',
          convertedCurrency: 'ARS',
          amountMinor: 30000,
          txCount: 8,
        },
        {
          category: null,
          categoryNormalized: 'uncategorized',
          convertedCurrency: 'ARS',
          amountMinor: 5000,
          txCount: 2,
        },
      ],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    const html = renderToStaticMarkup(
      <CategoryBreakdownCard breakdown={breakdown} month="2026-06" />,
    );
    // Card primitive compound.
    expect(html).toContain('<article');
    expect(html).toContain('Por categoría');
    // Table shape — primitives append className via cx(); match
    // the tag-name prefix instead of the bare '<thead>'.
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
    expect(html).toMatch(/<thead\b/);
    expect(html).toMatch(/<tbody\b/);
    expect(html).toContain('scope="col"');
    // Headers per design §9.3.
    expect(html).toContain('Categoría');
    expect(html).toContain('Monto');
    expect(html).toContain('Tx');
    // All three rows present.
    expect(html).toContain('food');
    expect(html).toContain('transport');
    expect(html).toContain('uncategorized');
    // Sort order: food must appear before transport must
    // appear before uncategorized in the rendered HTML.
    const foodIdx = html.indexOf('food');
    const transportIdx = html.indexOf('transport');
    const uncatIdx = html.indexOf('uncategorized');
    expect(foodIdx).toBeGreaterThan(-1);
    expect(transportIdx).toBeGreaterThan(foodIdx);
    expect(uncatIdx).toBeGreaterThan(transportIdx);
    // UTC label.
    expect(html).toContain('(UTC)');
    expect(html).toContain('2026-06');
    // Empty branch absent on the populated path.
    expect(html).not.toContain('role="status"');
  });
});

