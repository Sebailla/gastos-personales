/**
 * AccountFlowCard — pure render Server Component (slice 4
 * T-UI-308, originally T-RPT-305).
 *
 * Per design §7.3 + §9.2 + §9.3 + REQ-UI-3: the card now
 * consumes the DashboardAccountPicker (slice 4 T-UI-303).
 * Three branches the card must render:
 *
 *   1. `currentAccountId === null`: the CardHeader renders the
 *      picker (no `aria-current='page'`) and the body renders
 *      an `EmptyState` with a nudge to pick an account.
 *   2. `currentAccountId` set + flow with rows: the CardHeader
 *      renders the picker with `aria-current='page'` on the
 *      selected account; the body renders the days as a
 *      `Table` primitive (Fecha / Movimientos / Saldo).
 *   3. `currentAccountId` set + flow with zero rows: the
 *      CardHeader still renders the picker; the body renders
 *      an `EmptyState` explaining no movement happened.
 *
 * The card does NOT own the data fetch. The dashboard Server
 * Component (slice 4's page) fetches `/api/accounts` to derive
 * `accounts`, then fetches
 * `/api/reports/accounts/:id/flow?month=...` (only when
 * `currentAccountId !== null`) to derive `flow`. The card
 * renders what it is given.
 *
 * The (UTC) marker is irrelevant at the day-row level (per-day
 * bucketing is the wire shape); we surface the month string +
 * (UTC) so the user can reconcile the day rows against the
 * UTC anchor of the month (BR-RPT-3).
 *
 * No `'use client'` directive. Pure render Server Component.
 */

import { Card, CardHeader, CardBody, CardFooter } from '../_ui/primitives/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  type TableColumn,
} from '../_ui/primitives/table';
import { Badge } from '../_ui/primitives/badge';
import { EmptyState } from '../_ui/primitives/empty-state';
import { DashboardAccountPicker } from './dashboard-account-picker';
import type { AccountFlowDTO } from '../_lib/report-types';
import type { FinancialAccountWire } from '../_lib/account-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  accounts: ReadonlyArray<Pick<FinancialAccountWire, 'id' | 'name'>>;
  currentAccountId: string | null;
  flow: AccountFlowDTO | null;
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

const FLOW_COLUMNS: ReadonlyArray<TableColumn> = [
  { key: 'date', label: 'Fecha' },
  { key: 'count', label: 'Movimientos' },
  { key: 'net', label: 'Neto del día' },
  { key: 'running', label: 'Saldo acumulado' },
];

export function AccountFlowCard({
  accounts,
  currentAccountId,
  flow,
  month,
}: Props): React.JSX.Element {
  const hasPicker = accounts.length > 0;
  const isPopulated = flow !== null && flow.days.length > 0;
  return (
    <Card
      aria-label={
        currentAccountId
          ? `Flujo de cuenta para ${month}`
          : `Flujo de cuenta ${month}`
      }
    >
      <CardHeader
        title="Flujo por cuenta"
        badge={<Badge variant="neutral">{month} (UTC)</Badge>}
        actions={
          hasPicker ? (
            <DashboardAccountPicker
              accounts={accounts}
              currentAccountId={currentAccountId}
            />
          ) : undefined
        }
      />
      {currentAccountId === null ? (
        // Branch 1: no account is selected. Nudge the user
        // toward picking one from the picker in the header.
        <CardBody>
          <EmptyState
            title="Elegí una cuenta"
            description="Seleccioná una cuenta del selector para ver el flujo diario del mes."
          />
        </CardBody>
      ) : isPopulated ? (
        // Branch 2: account + flow rows.
        <>
          <CardBody>
            <Table caption="Flujo diario de la cuenta por día (moneda convertida)">
              <TableHeader columns={FLOW_COLUMNS} />
              <TableBody>
                {flow!.days.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{d.date}</TableCell>
                    <TableCell className="text-right">{d.count}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(d.netMinor, d.convertedCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(d.runningBalanceMinor, d.convertedCurrency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
          <CardFooter>
            <span className="text-ui-text-xs text-ui-fg-muted">
              {flow!.days.length} día{flow!.days.length === 1 ? '' : 's'} con
              movimiento en {month} (UTC).
            </span>
          </CardFooter>
        </>
      ) : (
        // Branch 3: account selected but the flow endpoint
        // returned zero rows for the requested month.
        <CardBody>
          <EmptyState
            title="Sin datos"
            description={`La cuenta seleccionada no registró movimientos durante ${month}.`}
          />
        </CardBody>
      )}
    </Card>
  );
}
