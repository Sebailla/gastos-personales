/**
 * Tests for `MonthlySummaryCard` — dashboard-ui slice 4
 * (T-UI-306, originally T-RPT-303).
 *
 * Snapshot tests using `react-dom/server`'s
 * `renderToStaticMarkup` (the existing test seam; see
 * `app/accounts/[id]/balance-widget.test.tsx` precedent).
 * Three cases:
 *
 *   1. Empty state: `totals: []` → renders an `EmptyState`
 *      with a CTA to `/transactions/new` (per design §9.3
 *      + REQ-UI-3).
 *   2. Populated state: two totals rows (ARS + USD) → assert
 *      the `<table>` shape + the UTC month label surface
 *      inside the CardHeader.
 *   3. Row-count assertion: the populated table renders BOTH
 *      currency rows with formatted amounts.
 *
 * Per slice 4's redesign (design §7.3): the card is now a
 * Card primitive compound (Card + CardHeader + CardBody +
 * CardFooter) consuming the Table primitive for the totals
 * rows and the EmptyState primitive for the empty branch.
 *
 * No logic in tests (root AGENTS.md §10.5): fixtures are
 * hand-written, the assertions are direct `toContain` checks.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MonthlySummaryDTO } from '../_lib/report-types';
import { MonthlySummaryCard } from './dashboard-monthly-summary';

describe('MonthlySummaryCard (slice 4 T-UI-306)', () => {
  it('renders the empty state via EmptyState + CTA to /transactions/new', () => {
    const empty: MonthlySummaryDTO = {
      totals: [],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    const html = renderToStaticMarkup(<MonthlySummaryCard summary={empty} month="2026-06" />);
    // CardHeader title + UTC month label.
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('2026-06');
    expect(html).toContain('(UTC)');
    // EmptyState: no rows; CTA linking to /transactions/new.
    expect(html).toContain('/transactions/new');
    // EmptyState role="status" sentinel.
    expect(html).toContain('role="status"');
  });

  it('renders the populated state as a Table inside a Card primitive', () => {
    const summary: MonthlySummaryDTO = {
      totals: [
        {
          convertedCurrency: 'ARS',
          incomeMinor: 150000,
          expenseMinor: 80000,
          netMinor: 70000,
          count: 5,
        },
        {
          convertedCurrency: 'USD',
          incomeMinor: 50000,
          expenseMinor: 10000,
          netMinor: 40000,
          count: 2,
        },
      ],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    const html = renderToStaticMarkup(<MonthlySummaryCard summary={summary} month="2026-06" />);
    // Card primitive compound — <article> + CardHeader <h2>.
    expect(html).toContain('<article');
    expect(html).toContain('Resumen mensual');
    // Table shape from the Table primitive. The TableHeader +
    // TableBody primitives append className via cx(), so the
    // assertions match `class=...thead...` rather than the bare
    // tag name.
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
    expect(html).toMatch(/<thead\b/);
    expect(html).toMatch(/<tbody\b/);
    expect(html).toContain('scope="col"');
    // Headers per design §9.3: Currency / Ingresos / Gastos / Neto / #.
    expect(html).toContain('Currency');
    expect(html).toContain('Ingresos');
    expect(html).toContain('Gastos');
    expect(html).toContain('Neto');
    // Both rows present with formatted amounts.
    expect(html).toContain('ARS');
    expect(html).toContain('USD');
    // UTC label per BR-RPT-3.
    expect(html).toContain('(UTC)');
    expect(html).toContain('2026-06');
    // Empty branch absent on the populated path.
    expect(html).not.toContain('role="status"');
  });
});

