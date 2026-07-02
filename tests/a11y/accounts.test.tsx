/**
 * Slice 5 — page-level axe-core integration test for /accounts.
 *
 * Per design §13.4 + REQ-UI-7 (a11y contract): the production
 * /accounts Server Component renders the full PageHeader +
 * AccountsListTable inside a PageContainer. The slice-5
 * integration suite asserts ZERO `critical` or `serious`
 * axe-core violations on the FULL page render (not just the
 * child Client Component).
 *
 * The slice-2 chore(test) contract at
 * `app/accounts/__tests__/accessibility.test.tsx` covers the
 * AccountsListTable Client Component in isolation. This new
 * test exercises the Server Component shell + its child
 * compound (PageContainer + PageHeader + Link CTA +
 * AccountsListTable) end-to-end so the orchestrator gets a
 * single audit surface for the slice-5 verify gate.
 *
 * TDD: T-UI-402 (RED). The pattern matches the
 * `app/dashboard/page.test.tsx` precedent (await the async
 * Server Component, then render the JSX). The helper
 * `expectNoCriticalOrSerious` lives at `tests/a11y/setup.ts`.
 */

// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { expectNoCriticalOrSerious } from './setup';
import { act } from 'react';

// Mock Next's redirect so a missing-session assertion can
// catch the redirect path (matches the dashboard test pattern).
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`__redirect:${url}`);
  },
}));

// Mock `auth()` so the page thinks a user is signed in.
vi.mock('@/modules/auth/nextauth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'u1', email: 'u1@example.com' } })),
}));

// Mock `serverHonoRequest` so the /api/accounts call returns
// a seeded wire response without booting the Hono composition
// root. Two active accounts + one archived so the surface
// exercises BOTH the populated table AND the "Show archived"
// toggle.
const ACCOUNTS_LIST_RESPONSE = {
  data: [
    {
      id: 'a1',
      userId: 'u1',
      type: 'BANK',
      name: 'Main ARS',
      currency: 'ARS',
      openingBalanceMinor: 100000,
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
      openingBalanceMinor: 5000,
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
    {
      id: 'a3',
      userId: 'u1',
      type: 'INVESTMENT',
      name: 'Old IRA',
      currency: 'USD',
      openingBalanceMinor: 0,
      openingBalanceMode: 'CURRENT',
      openingBalanceDate: null,
      archivedAt: '2026-04-15T00:00:00.000Z', // archived
      bankName: null,
      accountKind: null,
      issuer: null,
      creditLimitMinor: null,
      statementDay: null,
      paymentDueDay: null,
      broker: 'Fidelity',
      investmentType: 'RETIREMENT',
      walletAddress: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  nextCursor: null,
  total: 3,
};

vi.mock('@/lib/server-hono', () => ({
  serverHonoRequest: vi.fn(async () => new Response(JSON.stringify(ACCOUNTS_LIST_RESPONSE), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
}));

// Import AFTER the mocks are registered.
import AccountsPage from '../../app/[locale]/accounts/page';

describe('/accounts — page-level axe-core integration (slice 5 T-UI-402 RED)', () => {
  it('renders the full page with zero critical + serious axe-core violations', async () => {
    // The page is an async Server Component. Awaiting its
    // default-export function returns the rendered JSX.
    const jsx = await AccountsPage();
    // Render to a real DOM container so axe-core can walk
    // the nodes (renderToStaticMarkup returns an HTML
    // string which axe-core cannot inspect).
    const { container } = await act(async () => render(jsx));
    const results = await axe(container);
    const blocking = expectNoCriticalOrSerious(results);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
