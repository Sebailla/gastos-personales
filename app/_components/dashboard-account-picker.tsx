/**
 * DashboardAccountPicker — Server Component (FIX 3 — 4R review).
 *
 * Renders a `<nav>` of `<Link>`s, one per account. Picking an
 * account navigates to `/dashboard?accountId=<id>` so the
 * dashboard Server Component (slice 4's page) re-renders with
 * the deep-link search param, which triggers the
 * `/api/reports/accounts/:id/flow` fetch (per design §9.3 +
 * §17).
 *
 * Per design §15.4 + REQ-UI-7 + REQ-UI-8:
 * - `<Link>`-based (not `<button>`-based) so right-click
 *   'open in new tab' works — the only way to preserve that
 *   contract is anchors.
 * - `aria-current="page"` on the currently-selected account.
 * - Empty accounts list renders nothing (the parent decides
 *   whether to surface the picker; an empty list is a no-op).
 * - Focus ring on every interactive element (`focus-visible`
 *   per the design system primitives).
 *
 * FIX 3 — removed the `'use client'` directive. The component
 * is a pure `<Link>` wrapper with no `useState`, `useEffect`,
 * event handlers, or browser-only APIs. `next/link` is RSC-
 * compatible; removing the directive ships ~3 KB less JS to
 * the dashboard. The previous Client-Component declaration
 * was a defensive legacy from the slice 4 implementation and
 * was not technically required.
 *
 * No `'use client'` directive. Pure render Server Component.
 */

import NextLink from 'next/link';
import type { FinancialAccountWire } from '../_lib/account-types';

export interface DashboardAccountPickerProps {
  accounts: ReadonlyArray<Pick<FinancialAccountWire, 'id' | 'name'>>;
  currentAccountId: string | null;
}

export function DashboardAccountPicker({
  accounts,
  currentAccountId,
}: DashboardAccountPickerProps): React.JSX.Element | null {
  if (accounts.length === 0) return null;
  return (
    <nav aria-label="Account picker" className="flex flex-wrap gap-ui-space-2">
      {accounts.map((account) => {
        const isCurrent = currentAccountId === account.id;
        return (
          <NextLink
            key={account.id}
            href={`/dashboard?accountId=${account.id}`}
            aria-current={isCurrent ? 'page' : undefined}
            className={
              'rounded-ui-md border border-ui-border px-ui-space-3 py-ui-space-1 ' +
              'text-ui-text-sm text-ui-fg hover:bg-ui-bg-muted ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2 ' +
              (isCurrent ? 'bg-ui-bg-muted font-ui-font-semibold' : '')
            }
          >
            {account.name}
          </NextLink>
        );
      })}
    </nav>
  );
}
