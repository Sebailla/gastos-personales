/**
 * Slice 5 — E2E happy path #3: navigate to /accounts/X.
 *
 * Per design §13.6 + §14.5: the user signs in → navigates to
 * `/accounts/X` → the BalanceWidget renders the casa-converted
 * amount (the page-level AccountDetail Card exposes the
 * widget per design §7.3).
 *
 * The slice-5 smoke test renders the production
 * `AccountDetail` Client Component (the surface the
 * slice-2 chore test at `app/accounts/[id]/account-detail.test.tsx`
 * exercises) AND the `BalanceWidget` Client Component that the
 * detail page mounts. After rendering, the test fires the
 * 'Convert' form submit on the widget and asserts the widget
 * renders the converted amount + FX rate + fxAsOf from the
 * stubbed `/api/accounts/:id/balance` endpoint.
 *
 * Why this is the meaningful slice-5 E2E: the smoke confirms
 * (a) the production page renders without crashing on the
 * full flow, (b) the BalanceWidget's `fetch` contract hits
 * the right URL with the right query param, (c) the
 * casa-converted amount surface renders the wire format
 * correctly. Each assertion maps to a SPEC scenario in
 * REQ-ACC-18 + BR-ACC-18.
 *
 * TDD: T-UI-416 (RED + GREEN merged; BalanceWidget already
 * implements this surface).
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refreshMock = vi.fn<() => void>();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => undefined,
    refresh: refreshMock,
    back: () => undefined,
    forward: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
  redirect: () => {
    throw new Error('__redir');
  },
}));

import { AccountDetail } from '../../app/accounts/[id]/account-detail';
import { BalanceWidget } from '../../app/accounts/[id]/balance-widget';
import type { FinancialAccountWire } from '../../app/_lib/account-types';

function makeAccount(overrides: Partial<FinancialAccountWire> = {}): FinancialAccountWire {
  return {
    id: 'acc-1',
    userId: 'u1',
    type: 'BANK',
    name: 'Casa USD',
    currency: 'USD',
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
    ...overrides,
  };
}

beforeEach(() => {
  refreshMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('E2E happy path #3 \u2014 navigate to /accounts/X (slice 5 T-UI-416)', () => {
  it('AccountDetail renders the BalanceWidget which converts the casa amount on demand', async () => {
    // Stub the /api/accounts/:id/balance?displayCurrency=EUR
    // response with a stable fixture so the widget's fetch +
    // state transitions are deterministic.
    vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/api/accounts/acc-1/balance')) {
        return new Response(
          JSON.stringify({
            data: {
              native: { amount: 100000, currency: 'USD' },
              display: { amount: 92500, currency: 'EUR', fxRate: 0.925, fxAsOf: '2026-06-15T12:00:00.000Z' },
              stale: false,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    });

    const user = userEvent.setup();
    const account = makeAccount();
    // Render the FULL detail surface per design §7.3: the
    // AccountDetail Card (with name + currency + casa +
    // footer actions) AND the BalanceWidget the page mounts
    // beside the Card. The slice-5 integration-layer smokes
    // the rendered-card shape + widget end-to-end.
    render(
      <div>
        <AccountDetail account={account} />
        <BalanceWidget
          accountId={account.id}
          nativeAmount={account.openingBalanceMinor}
          nativeCurrency="USD"
        />
      </div>,
    );

    // The detail surface renders the account name + the
    // BalanceWidget's "Native: ..." line.
    // The CardHeader.title is an <h2> per design §7.3 + the
    // slice-1 Card primitive (the <h1> is the PageHeader
    // title which is not in scope for this Client Component).
    expect(screen.getByRole('heading', { level: 2, name: /casa usd/i })).toBeInTheDocument();
    expect(screen.getByText(/native:/i)).toBeInTheDocument();

    // Switch the display currency to EUR and click Convert
    // \u2194 the widget fetches /api/accounts/acc-1/balance?displayCurrency=EUR
    const select = screen.getByRole('combobox', { name: /display in/i });
    await user.selectOptions(select, 'EUR');
    const convert = screen.getByRole('button', { name: /convert/i });
    await act(async () => {
      await user.click(convert);
    });

    // Fetch was called with the right URL + query param.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = (
      global.fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }
    ).mock.calls[0]!;
    expect(String(calledUrl)).toMatch(
      /^\/api\/accounts\/acc-1\/balance\?displayCurrency=EUR$/,
    );

    // The widget rendered the converted amount + FX rate +
    // fxAsOf from the response. The text spans multiple
    // sibling elements (formatted amount + decimal rate +
    // timestamp). We locate the result block (the <div>
    // with the gray background per the production widget)
    // and assert on its concatenated textContent.
    const balanceHeading = screen.getByRole('heading', { level: 2, name: /balance/i });
    const widgetRoot = balanceHeading.closest('section') as HTMLElement;
    expect(widgetRoot).toBeTruthy();
    // Concatenated textContent of the result <div>.
    const resultBlocks = Array.from(widgetRoot.querySelectorAll('div')).filter((d) =>
      /last updated:/i.test(d.textContent ?? ''),
    );
    expect(resultBlocks).toHaveLength(1);
    expect(resultBlocks[0]!.textContent).toMatch(/display:.*€?925\.00.*@ 0\.9250/i);
    expect(resultBlocks[0]!.textContent).toMatch(/last updated:.*2026-06-15/i);
    // router.refresh() fired so the page re-reads the
    // account from the Server Component.
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
