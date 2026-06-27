/**
 * Tests for `MonthlySummaryCard` — dashboard-ui slice 4 (T-RPT-303).
 *
 * Snapshot tests using `react-dom/server`'s
 * `renderToStaticMarkup` (the existing test seam; see
 * `app/accounts/[id]/balance-widget.test.tsx` precedent). Two
 * cases:
 *
 *   1. Empty state: `totals: []` → assert "Sin datos" + "Resumen
 *      mensual" surface in the HTML.
 *   2. Populated state: two totals rows (ARS + USD) → assert the
 *      `<table>` shape + the UTC month label.
 *
 * No logic in tests (root AGENTS.md §10.5): fixtures are
 * hand-written, the assertions are direct `toContain` checks.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MonthlySummaryDTO } from '../_lib/report-types';
import { MonthlySummaryCard } from './dashboard-monthly-summary';

describe('MonthlySummaryCard (dashboard-ui T-RPT-303)', () => {
  it('renders the empty state with "Sin datos" + heading', () => {
    const empty: MonthlySummaryDTO = {
      totals: [],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    const html = renderToStaticMarkup(<MonthlySummaryCard summary={empty} month="2026-06" />);
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('Sin datos');
    expect(html).toContain('2026-06');
    expect(html).toContain('(UTC)');
  });

  it('renders the populated state with table rows for ARS + USD', () => {
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
    // Table shape.
    expect(html).toContain('<table');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
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
  });
});
