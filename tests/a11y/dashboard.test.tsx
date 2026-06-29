/**
 * Slice 5 — page-level axe-core integration test for /dashboard.
 *
 * Per design §13.4 + REQ-UI-7: the production /dashboard
 * Server Component reads `?accountId` + `?month` from
 * searchParams and renders three Card compounds (MonthlySummary
 * + CategoryBreakdown + AccountFlow) inside a 1+2 grid, plus
 * the DashboardMonthSwitcher inside the PageHeader's actions
 * slot. The slice-5 integration suite asserts ZERO `critical`
 * or `serious` axe-core violations on the FULL populated
 * render.
 *
 * The slice-4 chore tests (page.test.tsx + page.seeded.test.tsx)
 * pin the DOM-string contract for the empty + deep-link +
 * month branches. This new test exercises the axe contract on
 * the populated seed path (the most demanding a11y surface in
 * the slice) — it picks an account from the picker so the
 * AccountFlowCard renders its Table primitive (with caption +
 * scope=col) AND so all three cards carry their <CardHeader>
 * titles + a monthly Badge + (where applicable) a Table with
 * multi-row data.
 *
 * TDD: T-UI-405 (RED + GREEN). No production fix needed — the
 * slice-4 work + the slice-1 Table primitive + the slice-1
 * MonthlySummaryCard + CategoryBreakdownCard + AccountFlowCard
 * + DashboardAccountPicker + DashboardMonthSwitcher are
 * already axe-clean.
 */

// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { act } from 'react';

import { expectNoCriticalOrSerious } from './setup';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`__redirect:${url}`);
  },
}));

vi.mock('@/modules/auth/nextauth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'u1', email: 'u1@example.com' } })),
}));

// Seeded fixtures — same DTO shape as the dashboard
// page.test.tsx precedent (so the Zod schemas parse cleanly).
const MONTHLY_SUMMARY = {
  totals: [
    {
      convertedCurrency: 'ARS',
      incomeMinor: 200000,
      expenseMinor: 50000,
      netMinor: 150000,
      count: 12,
    },
  ],
  generatedAt: '2026-06-27T12:00:00.000Z',
};

const CATEGORY_BREAKDOWN = {
  buckets: [
    { category: 'food', categoryNormalized: 'food', convertedCurrency: 'ARS', amountMinor: 30000, txCount: 8 },
    { category: 'transport', categoryNormalized: 'transport', convertedCurrency: 'ARS', amountMinor: 15000, txCount: 4 },
    { category: null, categoryNormalized: 'uncategorized', convertedCurrency: 'ARS', amountMinor: 5000, txCount: 1 },
  ],
  generatedAt: '2026-06-27T12:00:00.000Z',
};

const ACCOUNT_FLOW = {
  fromDate: '2026-06-01',
  toDate: '2026-06-30',
  days: [
    { date: '2026-06-01', netMinor: 12000, runningBalanceMinor: 12000, count: 2, convertedCurrency: 'ARS' },
    { date: '2026-06-15', netMinor: -5000, runningBalanceMinor: 7000, count: 1, convertedCurrency: 'ARS' },
  ],
  generatedAt: '2026-06-30T23:59:59.000Z',
};

const ACCOUNTS_RESPONSE = {
  data: [
    {
      id: 'a1',
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
      id: 'a2',
      userId: 'u1',
      type: 'BANK',
      name: 'Brokerage USD',
      currency: 'USD',
      openingBalanceMinor: 0,
      openingBalanceMode: 'CURRENT',
      openingBalanceDate: null,
      archivedAt: null,
      bankName: 'Interactive Brokers',
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

// Path-prefix keyed lookup — mirrors the dashboard page.test.tsx pattern.
const FIXTURES_BY_PREFIX: ReadonlyArray<readonly [string, () => Response]> = [
  ['/api/accounts', () => new Response(JSON.stringify(ACCOUNTS_RESPONSE), { status: 200, headers: { 'content-type': 'application/json' } })],
  ['/api/reports/monthly', () => new Response(JSON.stringify(MONTHLY_SUMMARY), { status: 200, headers: { 'content-type': 'application/json' } })],
  ['/api/reports/breakdown', () => new Response(JSON.stringify(CATEGORY_BREAKDOWN), { status: 200, headers: { 'content-type': 'application/json' } })],
  ['/api/reports/accounts/', () => new Response(JSON.stringify(ACCOUNT_FLOW), { status: 200, headers: { 'content-type': 'application/json' } })],
];

vi.mock('@/lib/server-hono', () => ({
  serverHonoRequest: vi.fn(async (path: string, _init: RequestInit = {}) => {
    const match = FIXTURES_BY_PREFIX.find(([prefix]) => path.startsWith(prefix));
    return match
      ? match[1]()
      : new Response('not found', { status: 404 });
  }),
}));

// Import AFTER the mocks are registered.
import DashboardPage from '../../app/dashboard/page';

describe('/dashboard — page-level axe-core integration with ?accountId + ?month (slice 5 T-UI-405)', () => {
  it('renders the populated dashboard with zero critical + serious axe-core violations', async () => {
    // Deep-link branch (?accountId + ?month) exercises the
    // most demanding a11y surface: MonthlySummary Table +
    // CategoryBreakdown Table + AccountFlow Table + the
    // DashboardAccountPicker with aria-current + DashboardMonthSwitcher.
    const jsx = await DashboardPage({
      searchParams: Promise.resolve({ accountId: 'a1', month: '2026-06' }),
    });
    const { container } = await act(async () => render(jsx));
    const results = await axe(container);
    const blocking = expectNoCriticalOrSerious(results);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
