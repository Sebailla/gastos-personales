/**
 * Seeded-user snapshot for `app/dashboard/page.tsx` —
 * dashboard-ui slice 4 (T-UI-309 + T-UI-310).
 *
 * Companion to `page.test.tsx` (empty + deep-link + month
 * branches). Splitting the seeded case into its own file
 * avoids a shared mutable `currentFixture` selector — the
 * mock factory is purely declarative per file (no `if`/`else`
 * in setup, per root AGENTS.md §10.5).
 *
 * The seeded fixture has monthly totals (ARS, one row) +
 * two breakdown buckets (food + transport) + the picker
 * accounts. With NO ?accountId= the AccountFlowCard is in
 * branch 1 (EmptyState). The seeded test pins the populated
 * summary + breakdown + picker-with-no-selection contract.
 *
 * No logic in tests: assertions are direct `toContain`
 * checks against the rendered HTML.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderServerTree } from './test-helpers/render-server-tree';

vi.mock('@/modules/auth/nextauth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'u1', email: 'u1@example.com' } })),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`__redirect:${url}`);
  },
}));

import type { MonthlySummaryDTO, CategoryBreakdownDTO } from '../../_lib/report-types';

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

const ACCOUNTS_RESPONSE = {
  data: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      userId: 'u1',
      type: 'BANK',
      name: 'Main ARS',
      currency: 'ARS',
      openingBalanceMinor: 0,
      openingBalanceMode: 'CURRENT',
      openingBalanceDate: null,
      archivedAt: null,
      bankName: 'Banco Galicia',
      accountKind: null,
      issuer: null,
      creditLimitMinor: null,
      statementDay: null,
      paymentDueDay: null,
      broker: null,
      investmentType: null,
      walletAddress: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      userId: 'u1',
      type: 'BANK',
      name: 'Main USD',
      currency: 'USD',
      openingBalanceMinor: 0,
      openingBalanceMode: 'CURRENT',
      openingBalanceDate: null,
      archivedAt: null,
      bankName: 'Banco Galicia',
      accountKind: null,
      issuer: null,
      creditLimitMinor: null,
      statementDay: null,
      paymentDueDay: null,
      broker: null,
      investmentType: null,
      walletAddress: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  nextCursor: null,
  total: 2,
};

// The flow endpoint is NOT called when the page is rendered
// without an ?accountId= deep-link — its mock would return 404
// and the test would catch the contract drift.
const FIXTURES_BY_PREFIX: ReadonlyArray<readonly [string, () => Response]> = [
  ['/api/accounts', () => new Response(JSON.stringify(ACCOUNTS_RESPONSE), { status: 200 })],
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

describe('DashboardPage — seeded user (slice 4 T-UI-309 / T-UI-310)', () => {
  it('renders populated summary + breakdown + the picker for account selection', async () => {
    const jsx = await DashboardPage({ searchParams: Promise.resolve({}) });
    const html = await renderServerTree(jsx);
    // MonthlySummaryCard populated: a Table with totals columns.
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
    expect(html).toContain('Ingresos');
    expect(html).toContain('Gastos');
    expect(html).toContain('Neto');
    // CategoryBreakdownCard populated: the bucket rows show up.
    expect(html).toContain('food');
    expect(html).toContain('transport');
    // AccountFlowCard title surfaces; the picker renders the
    // two accounts; currentAccountId is null so no aria-current.
    expect(html).toContain('Flujo por cuenta');
    expect(html).toContain('aria-label="Account picker"');
    expect(html).toContain('href="/dashboard?accountId=00000000-0000-4000-8000-000000000001"');
    expect(html).toContain('href="/dashboard?accountId=00000000-0000-4000-8000-000000000002"');
    expect(html).not.toContain('aria-current="page"');
    // The flow endpoint is NEVER called when no ?accountId=
    // is passed.
    const flowCalls = mockServerHonoRequest.mock.calls.filter(([p]) => String(p).includes('/flow'));
    expect(flowCalls).toHaveLength(0);
    // Both monthly and breakdown were fetched. We inspect the
    // mock's call log directly rather than toHaveBeenCalledWith
    // to keep the assertion pure.
    const calledPaths = mockServerHonoRequest.mock.calls.map(([p]) => String(p));
    expect(calledPaths.some((p) => p.startsWith('/api/reports/monthly'))).toBe(true);
    expect(calledPaths.some((p) => p.startsWith('/api/reports/breakdown'))).toBe(true);
    // /api/accounts is fetched (for the picker).
    expect(calledPaths.some((p) => p.startsWith('/api/accounts'))).toBe(true);
  });
});
