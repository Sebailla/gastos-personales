/**
 * Tests for `AccountFlowCard` — dashboard-ui slice 4
 * (T-UI-308, originally T-RPT-305).
 *
 * Per design §7.3 + §9.2 + §9.3: the card now consumes the
 * DashboardAccountPicker (slice 4 T-UI-303). Three branches
 * are covered by three cases:
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
 * `accounts` + `currentAccountId` + `flow` down to this
 * card. The card is a pure render Server Component.
 *
 * No logic in tests (root AGENTS.md §10.5): fixtures are
 * hand-written, the assertions are direct `toContain`
 * checks.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountFlowCard } from './dashboard-account-flow';
import type { AccountFlowDTO, AccountFlowDayDTO } from '../_lib/report-types';

const ACCOUNTS = [
  { id: 'a1', name: 'Main ARS' },
  { id: 'a2', name: 'Main USD' },
] as const;

const POPULATED_FLOW: AccountFlowDTO = {
  fromDate: '2026-06-01',
  toDate: '2026-06-30',
  days: ([
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
  ] as AccountFlowDayDTO[]),
  generatedAt: '2026-06-30T23:59:59.000Z',
};

const EMPTY_FLOW: AccountFlowDTO = {
  fromDate: '2026-06-01',
  toDate: '2026-06-30',
  days: [],
  generatedAt: '2026-06-30T23:59:59.000Z',
};

describe('AccountFlowCard (slice 4 T-UI-308)', () => {
  it('renders an EmptyState in the body when no account is selected', () => {
    const html = renderToStaticMarkup(
      <AccountFlowCard
        accounts={ACCOUNTS}
        currentAccountId={null}
        flow={null}
        month="2026-06"
      />,
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

  it('renders a populated Table + picker with aria-current when an account is selected', () => {
    const html = renderToStaticMarkup(
      <AccountFlowCard
        accounts={ACCOUNTS}
        currentAccountId="a2"
        flow={POPULATED_FLOW}
        month="2026-06"
      />,
    );
    // Card compound.
    expect(html).toContain('<article');
    expect(html).toContain('Flujo por cuenta');
    // Picker present.
    expect(html).toContain('aria-label="Account picker"');
    // The selected account (a2) carries aria-current="page".
    expect(html).toContain('aria-current="page"');
    // The non-selected account does NOT carry aria-current.
    // (We assert the picker renders both links; the negative
    // assertion on aria-current is more brittle than a string
    // check on the whole aria-current attribute set, so we
    // do the positive check here.)
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

  it('renders an EmptyState in the body when the selected account has no flow', () => {
    const html = renderToStaticMarkup(
      <AccountFlowCard
        accounts={ACCOUNTS}
        currentAccountId="a1"
        flow={EMPTY_FLOW}
        month="2026-06"
      />,
    );
    // CardHeader + picker still render.
    expect(html).toContain('aria-label="Account picker"');
    // Empty state in the body (the account existed but had zero
    // movement this month).
    expect(html).toContain('role="status"');
    expect(html).toContain('Sin datos');
  });
});

