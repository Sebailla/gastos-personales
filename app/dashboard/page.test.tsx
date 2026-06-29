/**
 * Tests for `app/dashboard/page.tsx` — dashboard-ui slice 4
 * (T-UI-309 + T-UI-310).
 *
 * Three cases pinned in this file (the empty + the deep-link
 * branches). The seeded happy path is in
 * `page.seeded.test.tsx`.
 *
 *   1. Empty user + no searchParams: three Card compounds
 *      render; the MonthlySummaryCard + CategoryBreakdownCard
 *      surface EmptyState with the CTA to `/transactions/new`;
 *      the AccountFlowCard surfaces the EmptyState nudging
 *      the user to pick an account.
 *   2. ?accountId=<id>: the flow endpoint IS called and the
 *      AccountFlowCard renders its Table primitive.
 *   3. ?month=YYYY-MM: the page reads the search param and
 *      passes it to BOTH the monthly + breakdown endpoint
 *      URLs.
 *
 * The page is an async Server Component. We mock
 * `@/modules/auth/nextauth` (so `auth()` returns a fixed
 * session), `@/lib/server-hono` (so the in-process Hono call
 * returns our pre-seeded DTOs without booting Prisma), and
 * the accounts list endpoint (`/api/accounts?archivedAt=null`)
 * so the DashboardAccountPicker has accounts to render.
 *
 * `next/navigation`'s `redirect` is mocked to throw, matching
 * the signin page test pattern, so a missing-session
 * assertion can catch the redirect path.
 *
 * FIX 2 (4R review): the cards are now async + wrapped in
 * per-card `<Suspense>` boundaries. `renderToStaticMarkup` and
 * `renderToString` do NOT await async children inside Suspense
 * (they emit the fallback). We use `renderServerTree` (a thin
 * `renderToPipeableStream` + `onAllReady` wrapper) to await
 * every Suspense boundary before serializing, matching
 * Next.js's production behavior.
 *
 * The mock factory is split into two test files: this one
 * pins the empty + deep-link contract; `page.seeded.test.tsx`
 * pins the populated happy path. Splitting avoids a shared
 * mutable `currentFixture` selector inside a single file.
 *
 * No logic in tests (root AGENTS.md §10.5): the mock is
 * declared declaratively (no `if`/`else` in setup), the
 * assertions are direct `toContain` checks.
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

import type { MonthlySummaryDTO, CategoryBreakdownDTO, AccountFlowDTO } from '../_lib/report-types';

const EMPTY_MONTHLY: MonthlySummaryDTO = {
  totals: [],
  generatedAt: '2026-06-27T12:00:00.000Z',
};
const EMPTY_BREAKDOWN: CategoryBreakdownDTO = {
  buckets: [],
  generatedAt: '2026-06-27T12:00:00.000Z',
};
const POPULATED_FLOW: AccountFlowDTO = {
  fromDate: '2026-06-01',
  toDate: '2026-06-30',
  days: [
    {
      date: '2026-06-01',
      netMinor: 12000,
      runningBalanceMinor: 12000,
      count: 2,
      convertedCurrency: 'ARS',
    },
  ],
  generatedAt: '2026-06-30T23:59:59.000Z',
};

// The /api/accounts endpoint is called by the page to populate
// the picker. The wire shape mirrors the full FinancialAccountWire
// (the picker only reads id + name, but the Zod schema in the
// page validates the entire wire shape because the response is
// typed for downstream consumers too).
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

// Path-prefix keyed lookup. The lookup table dispatches between
// the four endpoints the page may call.
const FIXTURES_BY_PREFIX: ReadonlyArray<readonly [string, () => Response]> = [
  ['/api/accounts', () => new Response(JSON.stringify(ACCOUNTS_RESPONSE), { status: 200 })],
  ['/api/reports/monthly', () => new Response(JSON.stringify(EMPTY_MONTHLY), { status: 200 })],
  ['/api/reports/breakdown', () => new Response(JSON.stringify(EMPTY_BREAKDOWN), { status: 200 })],
  ['/api/reports/accounts/', () => new Response(JSON.stringify(POPULATED_FLOW), { status: 200 })],
];
const mockServerHonoRequest = vi.fn(async (path: string, _init: RequestInit = {}) => {
  const match = FIXTURES_BY_PREFIX.find(([prefix]) => path.startsWith(prefix));
  return match ? match[1]() : new Response('not found', { status: 404 });
});

vi.mock('@/lib/server-hono', () => ({
  serverHonoRequest: (path: string, init: RequestInit = {}) => mockServerHonoRequest(path, init),
}));

// Import AFTER the mocks are registered.
import DashboardPage from './page';

describe('DashboardPage — empty user (slice 4 T-UI-309)', () => {
  it('renders three Card compounds with empty states + the MonthSwitcher', async () => {
    const jsx = await DashboardPage({ searchParams: Promise.resolve({}) });
    const html = await renderServerTree(jsx);
    // PageContainer + PageHeader.
    expect(html).toContain('Dashboard');
    // MonthSwitcher surfaces.
    expect(html).toContain('aria-label="Month switcher"');
    // MonthSwitcher current month label (defaults to the
    // current UTC month).
    const nowMonth = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    expect(html).toContain(nowMonth);
    // Three cards render with their CardHeader titles.
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('Por categoría');
    expect(html).toContain('Flujo por cuenta');
    // MonthlySummaryCard carries the CTA to /transactions/new
    // (because both monthly.totals + breakdown.buckets are
    // empty in the seed fixtures).
    expect(html).toContain('/transactions/new');
    // AccountFlowCard surfaces the EmptyState (no accountId
    // in searchParams, so the picker is selected against null).
    expect(html).toContain('aria-label="Account picker"');
    expect(html).toContain('Elegí una cuenta');
    // The flow endpoint is NEVER called when no ?accountId=
    // is present.
    const flowCalls = mockServerHonoRequest.mock.calls.filter(([p]) => String(p).includes('/flow'));
    expect(flowCalls).toHaveLength(0);
  });
});

describe('DashboardPage — ?accountId= deep-link (slice 4 T-UI-309)', () => {
  it('calls the flow endpoint when ?accountId=<id> is present + renders the picker with aria-current', async () => {
    // FIX 4a — the deep-link accountId MUST be UUID-format
    // (the page now sanitizes malformed values to null).
    const accountId = '00000000-0000-4000-8000-000000000002';
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ accountId }),
    });
    const html = await renderServerTree(jsx);
    // The flow endpoint IS called with the deep-linked account.
    const flowCalls = mockServerHonoRequest.mock.calls.filter(([p]) =>
      String(p).includes(`/api/reports/accounts/${accountId}/flow`),
    );
    expect(flowCalls).toHaveLength(1);
    // The AccountFlowCard picks the deep-linked account.
    // (The picker renders the link with aria-current="page";
    // the smoke seed has a2 selected.)
    expect(html).toContain('aria-current="page"');
    // The Table primitive renders the day rows from the flow DTO.
    expect(html).toContain('2026-06-01');
  });
});

describe('DashboardPage — ?accountId= UUID-format validation (FIX 4a)', () => {
  it('sanitizes a path-injection attempt to null — the flow fetch is never invoked', async () => {
    mockServerHonoRequest.mockClear();
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ accountId: '../../etc/passwd' }),
    });
    await renderServerTree(jsx);
    // No flow endpoint call — the malformed accountId was
    // sanitized to null BEFORE reaching AccountFlowCard.
    const flowCalls = mockServerHonoRequest.mock.calls.filter(([p]) => String(p).includes('/flow'));
    expect(flowCalls).toHaveLength(0);
    // And no URL anywhere in the rendered HTML mentions the
    // injection payload.
    const html = await renderServerTree(
      await DashboardPage({
        searchParams: Promise.resolve({ accountId: '../../etc/passwd' }),
      }),
    );
    expect(html).not.toContain('../../etc/passwd');
  });

  it('accepts a canonical UUID', async () => {
    const accountId = '11111111-2222-4333-8444-555555555555';
    mockServerHonoRequest.mockClear();
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ accountId }),
    });
    await renderServerTree(jsx);
    const flowCalls = mockServerHonoRequest.mock.calls.filter(([p]) =>
      String(p).includes(`/api/reports/accounts/${accountId}/flow`),
    );
    expect(flowCalls).toHaveLength(1);
  });

  it('rejects a near-UUID with the wrong character set', async () => {
    mockServerHonoRequest.mockClear();
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ accountId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' }),
    });
    await renderServerTree(jsx);
    const flowCalls = mockServerHonoRequest.mock.calls.filter(([p]) => String(p).includes('/flow'));
    expect(flowCalls).toHaveLength(0);
  });
});

describe('DashboardPage — ?month= searchParam (slice 4 T-UI-309)', () => {
  it('passes ?month= to the monthly + breakdown endpoint URLs', async () => {
    mockServerHonoRequest.mockClear();
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ month: '2025-12' }),
    });
    // Render to trigger the calls.
    await renderServerTree(jsx);
    // Monthly endpoint gets month=2025-12.
    const monthlyCalls = mockServerHonoRequest.mock.calls
      .map(([p]) => String(p))
      .filter((p) => p.startsWith('/api/reports/monthly'));
    expect(monthlyCalls.some((p) => p.includes('month=2025-12'))).toBe(true);
    // Breakdown endpoint gets month=2025-12.
    const breakdownCalls = mockServerHonoRequest.mock.calls
      .map(([p]) => String(p))
      .filter((p) => p.startsWith('/api/reports/breakdown'));
    expect(breakdownCalls.some((p) => p.includes('month=2025-12'))).toBe(true);
  });
});
