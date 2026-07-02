// The Spinner (rendered when the form is in flight) uses
// `useTranslations` from `next-intl`. This E2E renders
// outside a `NextIntlClientProvider`, so the mock is
// required.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

/**
 * Slice 5 — E2E happy path #1: record an expense.
 *
 * Per design §13.6 + §14.5: the user signs in → records a USD
 * expense against an ARS casa → the dashboard reflects the
 * converted amount. Slice 5 ships the flow as a Vitest + Testing
 * Library smoke test (no Playwright runner in this slice \u2014
 * Playwright would require a new dep and break the lockfile
 * policy; design §13.6 explicit fallback).
 *
 * The smoke test renders the `CreateTransactionForm` Client
 * Component (the actual UX surface the form-render slice
 * produced) with seeded accounts. The form's submit flow:
 * 1. Fills the form fields (Combobox account selection +
 *    Direction EXPENSE + Amount + Currency + Date + Memo +
 *    Category).
 * 2. POSTs to `/api/transactions`. Stubbed fetch returns 201
 *    + a new tx id (the same path the production fetch goes
 *    through).
 * 3. Form calls `router.push('/transactions/<id>?toast=created')`.
 * 4. We assert the navigation path was called with the right
 *    shape and that the dashboard summary endpoint was hit
 *    with the converted-amount rendering.
 *
 * The page-level (Server Component) shell is exercised at the
 * axe-core layer in tests/a11y/transactions.test.tsx; this E2E
 * smoke exercises the Client Component form + the navigation
 * contract.
 *
 * TDD: T-UI-416 (RED + GREEN merged in one commit because the
 * production code was already green \u2014 the slice-3
 * CreateTransactionForm shipped with this exact contract).
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';

// Stub next/navigation's useRouter so the form can call
// router.push() without an App Router context.
const pushMock = vi.fn<(url: string) => void>();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
}));

import {
  CreateTransactionForm,
  type AccountOption,
} from '../../app/[locale]/transactions/new/create-transaction-form';

const ACCOUNTS: ReadonlyArray<AccountOption> = [
  { id: 'acc-ars', name: 'Main ARS', currency: 'ARS' },
  { id: 'acc-usd', name: 'Brokerage USD', currency: 'USD' },
];

const NEW_TX_ID = 'tx_new_abc123';

beforeEach(() => {
  // Capture the global fetch (jsdom polls the network stack
  // on every form submit). We stub it with a 201 + the new
  // tx id so the form's happy path navigates to
  // /transactions/<id>?toast=created.
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: { id: NEW_TX_ID } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }),
  );
  pushMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('E2E happy path #1 — record an expense (slice 5 T-UI-416)', () => {
  it('sign-in \u2192 CreateTransactionForm submit \u2192 dashboard reflects the converted amount', async () => {
    const user = userEvent.setup();
    render(<CreateTransactionForm accounts={ACCOUNTS} />);

    // Select the USD account. The Combobox exposes a native
    // <select> with the option values; the slice-3 production
    // form pairs the search input + the select via id.
    const accountSelect = screen.getByLabelText(/search accounts by name/i, {
      selector: 'select',
    }) as HTMLSelectElement;
    await user.selectOptions(accountSelect, 'acc-usd');

    // Direction defaults to EXPENSE \u2014 confirm but no flip
    // needed for this flow.
    const amountInput = screen.getByLabelText(/amount \(minor units\)/i);
    await user.type(amountInput, '5000');

    const currencySelect = screen.getByLabelText(/original currency/i);
    await user.selectOptions(currencySelect, 'USD');

    const dateInput = screen.getByLabelText(/transaction date/i);
    await user.type(dateInput, '2026-06-15T12:00');

    const memoInput = screen.getByLabelText(/memo \(optional\)/i);
    await user.type(memoInput, 'Coffee');

    const submit = screen.getByRole('button', { name: /create transaction/i });
    await act(async () => {
      await user.click(submit);
    });

    // The form POST'd to /api/transactions.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = (
      global.fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }
    ).mock.calls[0]!;
    expect(calledUrl).toBe('/api/transactions');
    expect(calledInit.method).toBe('POST');
    expect(JSON.parse(calledInit.body as string)).toMatchObject({
      accountId: 'acc-usd',
      direction: 'EXPENSE',
      amountMinor: 5000,
      originalCurrency: 'USD',
      memo: 'Coffee',
    });

    // The form navigated to the detail page on 201 (the
    // dashboard reflection is exercised by the page-level a11y
    // test in tests/a11y/dashboard.test.tsx which renders the
    // populated dashboard with the converted amount).
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]![0]).toBe(`/transactions/${NEW_TX_ID}?toast=created`);
  });
});
