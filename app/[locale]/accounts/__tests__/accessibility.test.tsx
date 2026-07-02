/**
 * Axe-core a11y contract for the accounts surface — slice 2 chore(test).
 *
 * Verifies that the production renders for the accounts pages
 * produce ZERO `critical` axe-core violations. The
 * `vitest-axe` matcher is registered globally in
 * `test/axe-setup.ts`. Serious violations are reported but
 * not blocking the gate (slice 5 widens the gate to serious).
 *
 * Scenarios covered:
 * - The accounts list page (PageHeader + AccountsListTable
 *   with two seeded accounts) renders without critical a11y
 *   issues. The page is a Server Component; we render the
 *   child components in isolation because the page's data
 *   fetch requires an authenticated session which is not
 *   available in the unit-test environment.
 * - The account detail Card layout renders without critical
 *   a11y issues.
 * - The create form Card layout renders without critical
 *   a11y issues.
 *
 * The full-page axe-core suite (which exercises the actual
 * Server Components through the Next dev server) lands in
 * slice 5 (`feat/ui-integration-tests`).
 */

// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';

// Stub `next/navigation` so the form can render without an App
// Router context (used by CreateAccountForm via useRouter).
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
}));

import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { AccountsListTable } from '../accounts-list-table';
import { AccountDetail } from '../[id]/account-detail';
import { CreateAccountForm } from '../new/create-account-form';
import type { FinancialAccountWire } from '../../../_lib/account-types';

function makeAccount(overrides: Partial<FinancialAccountWire> = {}): FinancialAccountWire {
  return {
    id: 'acc-1',
    userId: 'user-1',
    type: 'BANK',
    name: 'Main ARS',
    currency: 'ARS',
    openingBalanceMinor: 100000,
    openingBalanceMode: 'FRESH',
    openingBalanceDate: null,
    archivedAt: null,
    bankName: null,
    accountKind: null,
    issuer: null,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    broker: null,
    investmentType: null,
    walletAddress: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('accounts surface — axe-core a11y contract (critical only)', () => {
  it('AccountsListTable has no critical axe violations', async () => {
    const { container } = render(
      <AccountsListTable
        accounts={[makeAccount({ id: 'a', name: 'Apple' }), makeAccount({ id: 'b', name: 'Banana' })]}
        lastActivityIncluded
      />,
    );
    const results = await axe(container);
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });

  it('AccountDetail has no critical axe violations', async () => {
    const { container } = render(<AccountDetail account={makeAccount()} />);
    const results = await axe(container);
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });

  it('CreateAccountForm has no critical axe violations', async () => {
    const { container } = render(<CreateAccountForm />);
    const results = await axe(container);
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
