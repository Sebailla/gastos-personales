/**
 * Tests for `MonthlySummaryCard` — dashboard-ui slice 4
 * (T-UI-306, originally T-RPT-303) + FIX 2.
 *
 * After FIX 2 the card became self-fetching (async Server
 * Component). The test seam follows the page-level precedent
 * (`page.test.tsx`): mock `@/lib/server-hono` so the in-process
 * Hono call returns our pre-seeded DTOs without booting
 * Prisma, then `await` the card before passing the resolved
 * element to `renderToStaticMarkup`.
 *
 * Three cases:
 *
 *   1. Empty state: `totals: []` → renders an `EmptyState`
 *      with a CTA to `/transactions/new` (per design §9.3
 *      + REQ-UI-3).
 *   2. Populated state: two totals rows (ARS + USD) → assert
 *      the `<table>` shape + the UTC month label surface
 *      inside the CardHeader.
 *   3. Fetch failure: `/api/reports/monthly` returns 500 → the
 *      card throws so the per-card `<Suspense>` boundary in
 *      the dashboard page catches it. (FIX 2 isolation.)
 *
 * No logic in tests (root AGENTS.md §10.5): fixtures are
 * hand-written, the assertions are direct `toContain` checks.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MonthlySummaryDTO } from '../_lib/report-types';

const mockServerHonoRequest = vi.fn(async (_path: string, _init: RequestInit = {}) => {
  // The mock returns whatever the test's last `mockReturnValueOnce`
  // queued (defaults to 200 OK with empty body when none queued).
  return new Response('{}', { status: 200 });
});

vi.mock('@/lib/server-hono', () => ({
  serverHonoRequest: (path: string, init: RequestInit = {}) => mockServerHonoRequest(path, init),
}));

// Import AFTER the mocks are registered.
import { MonthlySummaryCard } from './dashboard-monthly-summary';

describe('MonthlySummaryCard (slice 4 T-UI-306)', () => {
  it('renders the empty state via EmptyState + CTA to /transactions/new', async () => {
    const empty: MonthlySummaryDTO = {
      totals: [],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(empty), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const html = renderToStaticMarkup(await MonthlySummaryCard({ month: '2026-06' }));
    // CardHeader title + UTC month label.
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('2026-06');
    expect(html).toContain('(UTC)');
    // EmptyState: no rows; CTA linking to /transactions/new.
    expect(html).toContain('/transactions/new');
    // EmptyState role="status" sentinel.
    expect(html).toContain('role="status"');
  });

  it('renders the populated state as a Table inside a Card primitive', async () => {
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
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const html = renderToStaticMarkup(await MonthlySummaryCard({ month: '2026-06' }));
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

  it('renders an in-card error surface when /api/reports/monthly returns 5xx (FIX 2 — per-card fetch failure isolation)', async () => {
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'monthly boom' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const html = renderToStaticMarkup(await MonthlySummaryCard({ month: '2026-06' }));
    // The card catches its own error (FIX 2) and renders the
    // CardHeader + a role="alert" surface with the error
    // message. The SIBLING cards continue to render because
    // the error stays inside this card's <Suspense> boundary.
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('monthly boom');
    expect(html).toContain('role="alert"');
    // The card's normal branches (EmptyState / Table) are absent.
    expect(html).not.toContain('/transactions/new');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('<table');
  });
});
