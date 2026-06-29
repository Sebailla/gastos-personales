/**
 * Per-card `<Suspense>` boundary tests (FIX 2 — 4R review).
 *
 * Design §16.5 requires each dashboard card to be wrapped in
 * its own `<Suspense fallback={<Skeleton/>}>`. Slice 4 omitted
 * it; the page did a single `Promise.all` over all four
 * endpoints, so a thrown fetch in one card tore down the
 * dashboard.
 *
 * FIX 2's actual contract: each card is a self-fetching async
 * Server Component that catches its OWN error and renders an
 * in-card `role="alert"` surface inside the Card primitive.
 * The `<Suspense>` boundary shows the Skeleton fallback while
 * the card is PENDING (still fetching); once the card throws,
 * the in-card catch handles the error UI. The sibling cards
 * continue to render because their fetches are independent.
 *
 * These tests pin the per-card failure-isolation contract:
 *
 *   1. A 5xx on `/api/reports/monthly` (the MonthlySummaryCard
 *      endpoint) does NOT take down the other two cards. The
 *      failed card surfaces `monthly boom` + `role="alert"`.
 *   2. A 5xx on `/api/reports/breakdown` does NOT take down
 *      the other two cards.
 *   3. A 5xx on `/api/reports/accounts/<id>/flow` does NOT
 *      take down the other two cards.
 *
 * The test seam: mock `@/lib/server-hono` with a path-prefix
 * keyed dispatch (mirrors the `page.test.tsx` + `page.seeded
 * .test.tsx` precedent — no `if` chains in setup, root AGENTS
 * .md §10.5). Render the dashboard page via `renderServerTree`
 * (a `renderToPipeableStream` wrapper that awaits every
 * Suspense boundary, matching Next.js's production behavior).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderServerTree } from '../test-helpers/render-server-tree';

vi.mock('@/modules/auth/nextauth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'u1', email: 'u1@example.com' } })),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`__redirect:${url}`);
  },
}));

import type {
  MonthlySummaryDTO,
  CategoryBreakdownDTO,
  AccountFlowDTO,
} from '../../_lib/report-types';

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
  ],
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
  ],
  nextCursor: null,
  total: 1,
};

// Pre-built happy-path fixtures (the 200 OK baseline) and the
// 500-error fixtures per endpoint. Each test selects ONE
// endpoint to fail by passing the matching fixtures table to
// the dispatcher below. No `if`/`else` in the test bodies.
const HAPPY_FIXTURES: ReadonlyArray<readonly [string, () => Response]> = [
  ['/api/accounts', () => new Response(JSON.stringify(ACCOUNTS_RESPONSE), { status: 200 })],
  ['/api/reports/monthly', () => new Response(JSON.stringify(SEEDED_MONTHLY), { status: 200 })],
  ['/api/reports/breakdown', () => new Response(JSON.stringify(SEEDED_BREAKDOWN), { status: 200 })],
  ['/api/reports/accounts/', () => new Response(JSON.stringify(POPULATED_FLOW), { status: 200 })],
];

const ERROR_MESSAGE_BY_PREFIX: Readonly<Record<string, string>> = {
  '/api/reports/monthly': 'monthly boom',
  '/api/reports/breakdown': 'breakdown boom',
  '/api/reports/accounts/': 'flow boom',
};

// Build a fixtures table where ONE prefix returns a 500 and
// the rest fall back to the happy-path fixtures. The lookup
// uses `.find()` (declarative, no `if`/`else`).
function fixturesWithFailureAt(
  failingPrefix: string,
): ReadonlyArray<readonly [string, () => Response]> {
  const failingFactory = (): Response =>
    new Response(
      JSON.stringify({
        error: { code: 'INTERNAL', message: ERROR_MESSAGE_BY_PREFIX[failingPrefix] ?? 'boom' },
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  const happyWithoutFailing = HAPPY_FIXTURES.filter(
    ([prefix]) => !prefix.startsWith(failingPrefix),
  );
  return [[failingPrefix, failingFactory], ...happyWithoutFailing];
}

const mockServerHonoRequest = vi.fn(async (path: string, _init: RequestInit = {}) => {
  const fixtures =
    (
      mockServerHonoRequest as unknown as {
        __fixtures: ReadonlyArray<readonly [string, () => Response]>;
      }
    ).__fixtures ?? HAPPY_FIXTURES;
  const match = fixtures.find(([prefix]) => path.startsWith(prefix));
  return match ? match[1]() : new Response('not found', { status: 404 });
});

vi.mock('@/lib/server-hono', () => ({
  serverHonoRequest: (path: string, init: RequestInit = {}) => mockServerHonoRequest(path, init),
}));

// Import AFTER the mocks are registered.
import DashboardPage from '../page';

describe('DashboardPage — per-card <Suspense> isolation (FIX 2, design §16.5)', () => {
  it('a 5xx on /api/reports/monthly does NOT take down the other two cards', async () => {
    mockServerHonoRequest.mockClear();
    (
      mockServerHonoRequest as unknown as {
        __fixtures: ReadonlyArray<readonly [string, () => Response]>;
      }
    ).__fixtures = fixturesWithFailureAt('/api/reports/monthly');
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ accountId: '00000000-0000-4000-8000-000000000001' }),
    });
    const html = await renderServerTree(jsx);
    // MonthlySummaryCard caught its error and rendered an
    // in-card error surface (FIX 2). The card title + error
    // message must both surface so the user knows WHICH card
    // failed and WHY.
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('monthly boom');
    expect(html).toContain('role="alert"');
    // The other two cards stayed alive.
    expect(html).toContain('Por categoría');
    expect(html).toContain('Flujo por cuenta');
    expect(html).toContain('food');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('2026-06-01');
  });

  it('a 5xx on /api/reports/breakdown does NOT take down the other two cards', async () => {
    mockServerHonoRequest.mockClear();
    (
      mockServerHonoRequest as unknown as {
        __fixtures: ReadonlyArray<readonly [string, () => Response]>;
      }
    ).__fixtures = fixturesWithFailureAt('/api/reports/breakdown');
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ accountId: '00000000-0000-4000-8000-000000000001' }),
    });
    const html = await renderServerTree(jsx);
    expect(html).toContain('Por categoría');
    expect(html).toContain('breakdown boom');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('Flujo por cuenta');
    expect(html).toContain('Ingresos');
    expect(html).toContain('aria-current="page"');
  });

  it('a 5xx on /api/reports/accounts/:id/flow does NOT take down the other two cards', async () => {
    mockServerHonoRequest.mockClear();
    (
      mockServerHonoRequest as unknown as {
        __fixtures: ReadonlyArray<readonly [string, () => Response]>;
      }
    ).__fixtures = fixturesWithFailureAt('/api/reports/accounts/');
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ accountId: '00000000-0000-4000-8000-000000000001' }),
    });
    const html = await renderServerTree(jsx);
    expect(html).toContain('Flujo por cuenta');
    expect(html).toContain('flow boom');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('2026-06-01');
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('Por categoría');
    expect(html).toContain('Ingresos');
    expect(html).toContain('food');
  });
});
