/**
 * Tests for AccountDetail — slice 2 T-UI-104.
 *
 * Per design §7.3 the detail renders a Card compound:
 * - CardHeader with the account name as the title, the
 *   currency as a Badge, and the archived Badge when
 *   `archivedAt !== null`.
 * - CardBody with key-value rows for currency / casa / createdAt.
 * - CardFooter with Edit + Archive actions.
 *
 * The AccountDetail is a Server Component (pure render),
 * no Client hooks.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountDetail } from './account-detail';
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

describe('AccountDetail — Card layout', () => {
  it('renders the Card layout with the account name as the CardHeader title', () => {
    render(<AccountDetail account={makeAccount({ name: 'Main ARS' })} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Main ARS' })).toBeInTheDocument();
  });

  it('renders the currency as a Badge in the CardHeader', () => {
    render(<AccountDetail account={makeAccount({ currency: 'USD' })} />);
    // Badge is a <span>; the test pins the currency text is rendered.
    expect(screen.getByText('USD', { selector: 'span' })).toBeInTheDocument();
  });

  it('renders the Archived badge when archivedAt is not null', () => {
    render(
      <AccountDetail
        account={makeAccount({ archivedAt: '2026-05-01T00:00:00.000Z' })}
      />,
    );
    expect(screen.getByText('Archived', { selector: 'span' })).toBeInTheDocument();
  });

  it('does NOT render the Archived badge when archivedAt is null', () => {
    render(<AccountDetail account={makeAccount({ archivedAt: null })} />);
    expect(screen.queryByText('Archived', { selector: 'span' })).toBeNull();
  });

  it('renders the CardFooter with Edit and Archive actions', () => {
    render(<AccountDetail account={makeAccount()} />);
    expect(screen.getByRole('link', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
  });
});
