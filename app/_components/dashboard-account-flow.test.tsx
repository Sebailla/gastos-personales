/**
 * Tests for `AccountFlowCard` — dashboard-ui slice 4
 * (T-UI-308, originally T-RPT-305) + FIX 2.
 *
 * After FIX 2 the card became self-fetching (async Server
 * Component). The card fetches `/api/accounts` (for the
 * picker) and conditionally `/api/reports/accounts/:id/flow`
 * (only when `currentAccountId !== null`). The test seam
 * follows the page-level precedent: mock `@/lib/server-hono`
 * so the in-process Hono call returns our pre-seeded DTOs
 * without booting Prisma, then `await` the card before
 * passing the resolved element to `renderToStaticMarkup`.
 *
 * Three branches:
 *
 *   1. No `currentAccountId` + at least one account in the
 *      picker → the CardHeader renders the picker (no
 *      `aria-current='page'` because nothing is selected),
 *      and the CardBody renders an `EmptyState` instructing
 *      the user to pick an account.
 *   2. `currentAccountId` set + flow with rows → CardHeader
 *      renders the picker with `aria-current='page'` on the
 *      selected account, and the CardBody renders the
 *      AccountFlowDTO days as a Table primitive (Fecha /
 *      Movimientos / Saldo).
 *   3. `currentAccountId` set + flow with zero rows (account
 *      exists but had no movement this month) → CardHeader
 *      still renders the picker, and the CardBody renders
 *      an `EmptyState` explaining no movement happened.
 *
 * Per design §9.3: the picker + switcher state lives in the
 * URL query string; the Server Component page passes
 * `currentAccountId` + `month` down to this card. The card
 * owns both fetches. No logic in tests (root AGENTS.md §10.5).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AccountFlowDTO, AccountFlowDayDTO } from '../_lib/report-types';

const mockServerHonoRequest = vi.fn(async (_path: string, _init: RequestInit = {}) => {
  return new Response('{}', { status: 200 });
});

vi.mock('@/lib/server-hono', () => ({
  serverHonoRequest: (path: string, init: RequestInit = {}) => mockServerHonoRequest(path, init),
}));

// Import AFTER the mocks are registered.
import { AccountFlowCard } from './dashboard-account-flow';

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
    {
      date: '2026-06-15',
      netMinor: -5000,
      runningBalanceMinor: 7000,
      count: 1,
      convertedCurrency: 'ARS',
    },
  ] as AccountFlowDayDTO[],
  generatedAt: '2026-06-30T23:59:59.000Z',
};

const EMPTY_FLOW: AccountFlowDTO = {
  fromDate: '2026-06-01',
  toDate: '2026-06-30',
  days: [],
  generatedAt: '2026-06-30T23:59:59.000Z',
};

describe('AccountFlowCard (slice 4 T-UI-308)', () => {
  it('renders an EmptyState in the body when no account is selected', async () => {
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(ACCOUNTS_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const html = renderToStaticMarkup(
      await AccountFlowCard({ currentAccountId: null, month: '2026-06' }),
    );
    // Card compound + CardHeader title.
    expect(html).toContain('<article');
    expect(html).toContain('Flujo por cuenta');
    expect(html).toContain('2026-06');
    expect(html).toContain('(UTC)');
    // DashboardAccountPicker renders <nav aria-label="Account picker">.
    expect(html).toContain('aria-label="Account picker"');
    // Picker carries the two accounts as <Link>s.
    expect(html).toContain('href="/dashboard?accountId=a1"');
    expect(html).toContain('href="/dashboard?accountId=a2"');
    // No link carries aria-current because currentAccountId is null.
    expect(html).not.toContain('aria-current="page"');
    // Empty state surfaces in the body.
    expect(html).toContain('role="status"');
  });

  it('renders a populated Table + picker with aria-current when an account is selected', async () => {
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(ACCOUNTS_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(POPULATED_FLOW), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const html = renderToStaticMarkup(
      await AccountFlowCard({ currentAccountId: 'a2', month: '2026-06' }),
    );
    // Card compound.
    expect(html).toContain('<article');
    expect(html).toContain('Flujo por cuenta');
    // Picker present.
    expect(html).toContain('aria-label="Account picker"');
    // The selected account (a2) carries aria-current="page".
    expect(html).toContain('aria-current="page"');
    // Table primitive renders days.
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
    expect(html).toContain('scope="col"');
    // Days rows surface.
    expect(html).toContain('2026-06-01');
    expect(html).toContain('2026-06-15');
    // Empty state absent on the populated path.
    expect(html).not.toContain('role="status"');
  });

  it('renders an EmptyState in the body when the selected account has no flow', async () => {
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(ACCOUNTS_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(EMPTY_FLOW), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const html = renderToStaticMarkup(
      await AccountFlowCard({ currentAccountId: 'a1', month: '2026-06' }),
    );
    // CardHeader + picker still render.
    expect(html).toContain('aria-label="Account picker"');
    // Empty state in the body (the account existed but had zero
    // movement this month).
    expect(html).toContain('role="status"');
    expect(html).toContain('Sin datos');
  });

  it('silently swallows a 404 from /flow (per design §9.3) and renders the unavailability empty state', async () => {
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(ACCOUNTS_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'gone' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const html = renderToStaticMarkup(
      await AccountFlowCard({ currentAccountId: 'archived-1', month: '2026-06' }),
    );
    expect(html).toContain('aria-label="Account picker"');
    expect(html).toContain('role="status"');
    expect(html).toContain('ya no está disponible');
  });

  it('renders an in-card error surface when /flow returns a non-404 5xx (FIX 2 — per-card fetch failure isolation)', async () => {
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify(ACCOUNTS_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mockServerHonoRequest.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'flow boom' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const html = renderToStaticMarkup(
      await AccountFlowCard({ currentAccountId: 'a1', month: '2026-06' }),
    );
    expect(html).toContain('Flujo por cuenta');
    expect(html).toContain('flow boom');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('2026-06-01');
    expect(html).not.toContain('aria-current="page"');
  });
});
