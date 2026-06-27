/**
 * Seeded-user snapshot for `app/dashboard/page.tsx` —
 * dashboard-ui slice 4 (T-RPT-306).
 *
 * Companion to `page.test.tsx` (empty user). Splitting the
 * seeded case into its own file avoids a shared mutable
 * `currentFixture` selector — the mock factory is purely
 * declarative per file (no `if`/`else` in setup, per root
 * AGENTS.md §10.5).
 *
 * The seeded fixture has monthly totals (ARS, one row) +
 * two breakdown buckets (food + transport). The flow
 * endpoint is NOT called in v1 — the page never asks for it
 * (design §9.2). The test asserts that contract by checking
 * no `/flow` call lands in the mock.
 *
 * No logic in tests: assertions are direct `toContain` /
 * `toHaveBeenCalledWith` checks.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/modules/auth/nextauth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'u1', email: 'u1@example.com' } })),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`__redirect:${url}`);
  },
}));

import type { MonthlySummaryDTO, CategoryBreakdownDTO } from '../_lib/report-types';

const SEEDED_MONTHLY: MonthlySummaryDTO = {
  totals: [
    {
      convertedCurrency: 'ARS',
      incomeMinor: 100000,
      expenseMinor: 50000,
      netMinor: 50000,
      count: 4,
    },
  ],
  generatedAt: '2026-06-27T12:00:00.000Z',
};
const SEEDED_BREAKDOWN: CategoryBreakdownDTO = {
  buckets: [
    {
      category: 'Food',
      categoryNormalized: 'food',
      convertedCurrency: 'ARS',
      amountMinor: 30000,
      txCount: 5,
    },
    {
      category: 'Transport',
      categoryNormalized: 'transport',
      convertedCurrency: 'ARS',
      amountMinor: 20000,
      txCount: 3,
    },
  ],
  generatedAt: '2026-06-27T12:00:00.000Z',
};

// Path-prefix keyed lookup. The flow endpoint is intentionally
// absent — a future call lands as 404 in the mock, surfacing
// the contract drift here.
const FIXTURES_BY_PREFIX: ReadonlyArray<readonly [string, () => Response]> = [
  ['/api/reports/monthly', () => new Response(JSON.stringify(SEEDED_MONTHLY), { status: 200 })],
  ['/api/reports/breakdown', () => new Response(JSON.stringify(SEEDED_BREAKDOWN), { status: 200 })],
];
const mockServerHonoRequest = vi.fn(async (path: string, _init: RequestInit = {}) => {
  const match = FIXTURES_BY_PREFIX.find(([prefix]) => path.startsWith(prefix));
  return match ? match[1]() : new Response('not found', { status: 404 });
});

vi.mock('@/lib/server-hono', () => ({
  serverHonoRequest: (path: string, init: RequestInit = {}) => mockServerHonoRequest(path, init),
}));

import DashboardPage from './page';

describe('DashboardPage — seeded user (dashboard-ui T-RPT-306)', () => {
  it('renders three populated cards (flow still empty v1)', async () => {
    const jsx = await DashboardPage();
    const html = renderToStaticMarkup(jsx);
    // MonthlySummaryCard populated: a table with totals columns.
    expect(html).toContain('<table');
    expect(html).toContain('Ingresos');
    expect(html).toContain('Gastos');
    expect(html).toContain('Neto');
    // CategoryBreakdownCard populated: the bucket rows show up.
    expect(html).toContain('food');
    expect(html).toContain('transport');
    // AccountFlowCard still in v1 empty state.
    expect(html).toContain('Flujo por cuenta');
    expect(html).toContain('Sin datos');
    // The flow endpoint is NEVER called in v1.
    const flowCalls = mockServerHonoRequest.mock.calls.filter(([p]) => String(p).includes('/flow'));
    expect(flowCalls).toHaveLength(0);
    // Both monthly and breakdown were fetched. We inspect the
    // mock's call log directly rather than toHaveBeenCalledWith
    // to keep the assertion pure (the page calls the helper
    // with (path, init?) and Vitest's argument matcher needs
    // every positional arg to match — easier to read the call
    // log here).
    const calledPaths = mockServerHonoRequest.mock.calls.map(([p]) => String(p));
    expect(calledPaths.some((p) => p.startsWith('/api/reports/monthly'))).toBe(true);
    expect(calledPaths.some((p) => p.startsWith('/api/reports/breakdown'))).toBe(true);
  });
});
