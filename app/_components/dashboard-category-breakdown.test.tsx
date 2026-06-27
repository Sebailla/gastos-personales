/**
 * Tests for `CategoryBreakdownCard` — dashboard-ui slice 4
 * (T-RPT-304).
 *
 * Snapshot tests. Two cases:
 *
 *   1. Empty state: `buckets: []` → assert "Sin datos" + "Por
 *      categoría" in the HTML.
 *   2. Populated state: three buckets — assert the rows render
 *      in the order the fixture provides (descending by
 *      `amountMinor`). The fixture pre-sorts because the
 *      domain factory already sorts (BR-RPT-2 sort order);
 *      the test asserts the render does NOT re-sort or
 *      permute.
 *
 * No logic in tests (root AGENTS.md §10.5): fixtures are
 * hand-written, the assertions are direct `toContain` checks.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CategoryBreakdownDTO } from '../_lib/report-types';
import { CategoryBreakdownCard } from './dashboard-category-breakdown';

describe('CategoryBreakdownCard (dashboard-ui T-RPT-304)', () => {
  it('renders the empty state with "Sin datos" + heading', () => {
    const empty: CategoryBreakdownDTO = {
      buckets: [],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    const html = renderToStaticMarkup(<CategoryBreakdownCard breakdown={empty} month="2026-06" />);
    expect(html).toContain('Por categoría');
    expect(html).toContain('Sin datos');
    expect(html).toContain('2026-06');
    expect(html).toContain('(UTC)');
  });

  it('renders the populated state with three buckets sorted DESC by amountMinor', () => {
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
    // Table shape.
    expect(html).toContain('<table');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
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
  });
});
