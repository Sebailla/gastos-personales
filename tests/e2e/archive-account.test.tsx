/**
 * Slice 5 — E2E happy path #2: archive an account.
 *
 * Per design §13.6 + §14.5: the user signs in \u2192 archives an
 * account \u2192 the account disappears from the active list and
 * appears behind the `Show archived` toggle. Slice 5 ships the
 * flow as a Vitest + Testing Library smoke (no Playwright).
 *
 * The slice-2 production `AccountsListTable` Client Component
 * owns the `Show archived` toggle (per design \u00a715.2). The
 * slice-2 chore at
 * `app/accounts/accounts-list-table.test.tsx:104` already pins
 * the toggle behavior at the component level. THIS integration
 * smoke exercises the SAME flow at the page-level \u2014 rendering
 * the production Server Component page with a stubbed
 * `serverHonoRequest` that returns a list containing one
 * archived account, then drives the toggle through Testing
 * Library userEvent.
 *
 * Two assertions:
 * 1. Default render (toggle OFF) \u2192 archived row NOT visible.
 * 2. Click the toggle \u2192 archived row appears with the
 *    `Archived` Badge primitive.
 *
 * TDD: T-UI-416 (RED + GREEN merged in one commit because the
 * slice-2 component already implements the toggle behavior).
 */

// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`__redirect:${url}`);
  },
  useRouter: () => ({
    push: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
}));

vi.mock('@/modules/auth/nextauth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'u1', email: 'u1@example.com' } })),
}));

const ACCOUNTS_RESPONSE = {
  data: [
    {
      id: 'a-active-1',
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
      id: 'a-active-2',
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
      id: 'a-archived',
      userId: 'u1',
      type: 'INVESTMENT',
      name: 'Old IRA',
      currency: 'USD',
      openingBalanceMinor: 0,
      openingBalanceMode: 'CURRENT',
      openingBalanceDate: null,
      archivedAt: '2026-04-15T00:00:00.000Z',
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
  serverHonoRequest: vi.fn(async () => new Response(JSON.stringify(ACCOUNTS_RESPONSE), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
}));

import AccountsPage from '../../app/accounts/page';

describe('E2E happy path #2 \u2014 archive an account (slice 5 T-UI-416)', () => {
  it('archive flow: default hides archived; toggle reveals it', async () => {
    await act(async () => {
      const jsx = await AccountsPage();
      render(jsx);
    });

    // 1. Default state (toggle OFF): the archived row is
    // hidden. Header + 2 active data rows = 3 rows total.
    // The default sort is name ASC: Brokerage USD < Main
    // ARS, so rows[1] is Brokerage USD.
    let rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 active
    expect(within(rows[1]!).getByText('Brokerage USD')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Main ARS')).toBeInTheDocument();
    expect(screen.queryByText('Old IRA')).not.toBeInTheDocument();

    // 2. Toggle ON — archived row appears with the Badge.
    // After clicking, the list re-renders alphabetically: Brokerage
    // USD < Main ARS < Old IRA — three data rows + header.
    const user = userEvent.setup();
    const toggle = screen.getByRole('checkbox', { name: /show archived/i });
    await act(async () => {
      await user.click(toggle);
    });
    rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3 data rows
    const archivedRow = rows.find((r) => within(r).queryByText('Old IRA'));
    expect(archivedRow).toBeDefined();
    expect(within(archivedRow!).getByText('Archived', { selector: 'span' })).toBeInTheDocument();
    cleanup();
  });
});
