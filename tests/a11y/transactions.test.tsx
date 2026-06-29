/**
 * Slice 5 — page-level axe-core integration test for /transactions.
 *
 * Per design §13.4 + REQ-UI-7: the production /transactions
 * Server Component renders the full PageHeader +
 * TransactionsListTable inside a PageContainer, with the
 * EphemeralToast Client Component wrapped in a Suspense
 * boundary. The slice-5 integration suite asserts ZERO
 * `critical` or `serious` axe-core violations on the FULL
 * page render (Suspense + EphemeralToast + Client Component
 * + PageContainer + PageHeader + Link CTA + table).
 *
 * The slice-3 chore(test) at
 * `app/transactions/__tests__/accessibility.test.tsx` covers
 * the TransactionsListTable Client Component in isolation.
 * This new test exercises the FULL Server Component shell so
 * the orchestrator gets a single audit surface for the
 * slice-5 verify gate.
 *
 * TDD: T-UI-404 (RED + GREEN merged because the slice-3
 * chore work already produced an axe-clean surface — same
 * pattern as the accounts page test).
 */

// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { act } from 'react';

import { expectNoCriticalOrSerious } from './setup';

// Mock Next's redirect + useSearchParams (EphemeralToast
// reads useSearchParams to decide whether to render a toast).
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`__redirect:${url}`);
  },
  useSearchParams: () => new URLSearchParams(''),
}));

// Mock `auth()` so the page thinks a user is signed in.
vi.mock('@/modules/auth/nextauth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'u1', email: 'u1@example.com' } })),
}));

// Seeded transactions list response. Two rows exercise BOTH
// direction branches (INCOME + EXPENSE) per the slice-3
// production contract (REVENUE + SPEND layout).
const TRANSACTIONS_LIST_RESPONSE = {
  data: [
    {
      id: 'tx-1',
      userId: 'u1',
      accountId: 'a1',
      direction: 'INCOME',
      amountMinor: 50000,
      currency: 'USD',
      memo: 'Salary',
      category: 'salary',
      transactionDate: '2026-06-15T00:00:00.000Z',
      convertedAmountMinor: 50000,
      convertedCurrency: 'USD',
      fxAsOfSnapshot: '2026-06-15T12:00:00.000Z',
      casaSnapshot: null,
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
      accountName: 'Brokerage USD',
    },
    {
      id: 'tx-2',
      userId: 'u1',
      accountId: 'a2',
      direction: 'EXPENSE',
      amountMinor: 5000,
      currency: 'USD',
      memo: 'Groceries',
      category: 'food',
      transactionDate: '2026-06-16T00:00:00.000Z',
      convertedAmountMinor: 5000,
      convertedCurrency: 'USD',
      fxAsOfSnapshot: '2026-06-16T12:00:00.000Z',
      casaSnapshot: null,
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:00.000Z',
      accountName: 'Main ARS',
    },
  ],
  nextCursor: null,
  total: 2,
};

vi.mock('@/lib/server-hono', () => ({
  serverHonoRequest: vi.fn(async () => new Response(JSON.stringify(TRANSACTIONS_LIST_RESPONSE), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
}));

// Import AFTER the mocks are registered.
import TransactionsPage from '../../app/transactions/page';

describe('/transactions — page-level axe-core integration (slice 5 T-UI-404)', () => {
  it('renders the full page with zero critical + serious axe-core violations', async () => {
    const jsx = await TransactionsPage();
    const { container } = await act(async () => render(jsx));
    const results = await axe(container);
    const blocking = expectNoCriticalOrSerious(results);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
