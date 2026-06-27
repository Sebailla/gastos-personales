/**
 * Tests for `app/dashboard/page.tsx` — dashboard-ui slice 4
 * (T-RPT-306).
 *
 * Two snapshot cases:
 *
 *   1. Empty user (zero transactions): three "Sin datos" cards
 *      + the CTA linking to `/transactions/new`.
 *   2. Seeded user (transactions present): three populated
 *      cards — MonthlySummary + CategoryBreakdown with rows,
 *      AccountFlowCard still in its v1 empty state (the
 *      dashboard does NOT call the flow endpoint in v1, per
 *      design §9.2).
 *
 * The page is an async Server Component. We mock
 * `@/modules/auth/nextauth` (so `auth()` returns a fixed
 * session) and `@/lib/server-hono` (so the in-process Hono
 * call returns our pre-seeded DTOs without booting Prisma).
 * `next/navigation`'s `redirect` is mocked to throw, matching
 * the signin page test pattern, so a missing-session
 * assertion can catch the redirect path.
 *
 * The mock factory is split into two test files: this one
 * pins the empty-state contract; `page.seeded.test.tsx` pins
 * the populated contract. Splitting avoids a shared mutable
 * `currentFixture` selector inside this file (the test body
 * becomes pure assertions + declarative mocks — no `if`/`else`
 * in setup, per root AGENTS.md §10.5).
 *
 * No logic in tests (root AGENTS.md §10.5): the mock is
 * declared declaratively (no `if`/`else` in setup), the
 * assertions are direct `toContain` checks.
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

const EMPTY_MONTHLY: MonthlySummaryDTO = {
  totals: [],
  generatedAt: '2026-06-27T12:00:00.000Z',
};
const EMPTY_BREAKDOWN: CategoryBreakdownDTO = {
  buckets: [],
  generatedAt: '2026-06-27T12:00:00.000Z',
};

// The flow endpoint is NOT called in v1; the lookup table
// below intentionally omits it so an accidental call throws
// here, catching the drift before production.
const FIXTURES_BY_PREFIX: ReadonlyArray<readonly [string, () => Response]> = [
  ['/api/reports/monthly', () => new Response(JSON.stringify(EMPTY_MONTHLY), { status: 200 })],
  ['/api/reports/breakdown', () => new Response(JSON.stringify(EMPTY_BREAKDOWN), { status: 200 })],
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

describe('DashboardPage — empty user (dashboard-ui T-RPT-306)', () => {
  it('renders three "Sin datos" cards + CTA linking to /transactions/new', async () => {
    const jsx = await DashboardPage();
    const html = renderToStaticMarkup(jsx);
    // Three cards render with their empty-state messages.
    expect(html).toContain('Resumen mensual');
    expect(html).toContain('Por categoría');
    expect(html).toContain('Flujo por cuenta');
    expect(html.match(/Sin datos/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // CTA links to /transactions/new per design §9.2.
    expect(html).toContain('/transactions/new');
    // The flow endpoint is NEVER called in v1.
    const flowCalls = mockServerHonoRequest.mock.calls.filter(([p]) => String(p).includes('/flow'));
    expect(flowCalls).toHaveLength(0);
  });
});
