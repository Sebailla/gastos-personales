/**
 * AccountFlowCard — async Server Component (FIX 2 — 4R review).
 *
 * Refactored in `fix/ui-4r-cleanup` to be self-fetching so the
 * dashboard page can wrap it in its own `<Suspense>` boundary.
 * Per design §16.5 + §17: each card owns its fetch; a thrown
 * fetch error stays within the card's boundary and the sibling
 * cards continue to render.
 *
 * The card fetches TWO endpoints:
 *   - `/api/accounts?limit=50&archivedAt=null` for the picker
 *     (BR-ACC-17 — never show archived accounts in the picker).
 *   - `/api/reports/accounts/<id>/flow?month=<month>` ONLY when
 *     `currentAccountId !== null`. 404 is swallowed silently
 *     (per design §9.3 — the user no longer has access to the
 *     deep-linked account) and rendered as branch 1.
 *
 * Three render branches preserved from the pre-FIX-2 version:
 *   1. `currentAccountId === null`: picker + EmptyState nudge.
 *   2. account + flow rows: picker with aria-current + Table.
 *   3. account + zero rows: picker + empty EmptyState.
 *
 * No `'use client'` directive. Pure async Server Component.
 */

import { z } from 'zod';
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
import { serverHonoRequest } from '@/lib/server-hono';
import type { AccountFlowDTO } from '../_lib/report-types';
import type { AccountsListResponse, FinancialAccountWire } from '../_lib/account-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  currentAccountId: string | null;
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

const FLOW_COLUMNS: ReadonlyArray<TableColumn> = [
  { key: 'date', label: 'Fecha' },
  { key: 'count', label: 'Movimientos' },
  { key: 'net', label: 'Neto del día' },
  { key: 'running', label: 'Saldo acumulado' },
];

const accountFlowResponseSchema: z.ZodType<AccountFlowDTO> = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      netMinor: z.number(),
      runningBalanceMinor: z.number(),
      count: z.number(),
      convertedCurrency: z.string(),
    }),
  ),
  generatedAt: z.string(),
});

const financialAccountWireSchema: z.ZodType<FinancialAccountWire> = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  name: z.string(),
  currency: z.string(),
  openingBalanceMinor: z.number(),
  openingBalanceMode: z.string(),
  openingBalanceDate: z.string().nullable(),
  archivedAt: z.string().nullable(),
  bankName: z.string().nullable(),
  accountKind: z.string().nullable(),
  issuer: z.string().nullable(),
  creditLimitMinor: z.number().nullable(),
  statementDay: z.number().nullable(),
  paymentDueDay: z.number().nullable(),
  broker: z.string().nullable(),
  investmentType: z.string().nullable(),
  walletAddress: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastActivityAt: z.string().nullable().optional(),
});

const accountsListResponseSchema: z.ZodType<AccountsListResponse> = z.object({
  data: z.array(financialAccountWireSchema),
  nextCursor: z.string().nullable(),
  total: z.number(),
});

async function fetchAccountsForPicker(): Promise<
  ReadonlyArray<Pick<FinancialAccountWire, 'id' | 'name'>>
> {
  const res = await serverHonoRequest(`/api/accounts?limit=50&archivedAt=null`);
  if (!res.ok) {
    throw new Error(`accounts failed (${res.status})`);
  }
  const body = accountsListResponseSchema.parse(await res.json());
  return body.data;
}

async function fetchAccountFlow(accountId: string, month: string): Promise<AccountFlowDTO | null> {
  const res = await serverHonoRequest(`/api/reports/accounts/${accountId}/flow?month=${month}`);
  // 404 is a SILENT branch-1 transition per design §9.3: the
  // user no longer has access to this account (archived, cross-
  // user, etc.). Any other non-2xx propagates to the per-card
  // <Suspense> boundary so the OTHER cards stay alive.
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message ?? `flow failed (${res.status})`;
    throw new Error(message);
  }
  return accountFlowResponseSchema.parse(await res.json());
}

export async function AccountFlowCard({
  currentAccountId,
  month,
}: Props): Promise<React.JSX.Element> {
  // FIX 2 — per-card failure isolation (see MonthlySummaryCard
  // for the full rationale). The accounts list fetch is
  // required for the picker; a failure here should NOT take
  // down the sibling cards. The flow fetch swallows 404
  // silently per design §9.3; any other non-2xx is caught
  // below and rendered as an in-card error.
  let accounts: ReadonlyArray<Pick<FinancialAccountWire, 'id' | 'name'>>;
  let flow: AccountFlowDTO | null;
  try {
    [accounts, flow] = await Promise.all([
      fetchAccountsForPicker(),
      currentAccountId ? fetchAccountFlow(currentAccountId, month) : Promise.resolve(null),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No pudimos cargar el flujo de la cuenta.';
    return (
      <Card aria-label={`Flujo de cuenta ${month} — error`}>
        <CardHeader
          title="Flujo por cuenta"
          badge={<Badge variant="neutral">{month} (UTC)</Badge>}
        />
        <CardBody>
          <div role="alert" className="text-ui-text-sm text-ui-fg">
            {message}
          </div>
        </CardBody>
      </Card>
    );
  }

  const hasPicker = accounts.length > 0;
  const isPopulated = flow !== null && flow.days.length > 0;
  return (
    <Card
      aria-label={currentAccountId ? `Flujo de cuenta para ${month}` : `Flujo de cuenta ${month}`}
    >
      <CardHeader
        title="Flujo por cuenta"
        badge={<Badge variant="neutral">{month} (UTC)</Badge>}
        actions={
          hasPicker ? (
            <DashboardAccountPicker accounts={accounts} currentAccountId={currentAccountId} />
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
              {flow!.days.length} día{flow!.days.length === 1 ? '' : 's'} con movimiento en {month}{' '}
              (UTC).
            </span>
          </CardFooter>
        </>
      ) : (
        // Branch 3: account selected but the flow endpoint
        // returned zero rows for the requested month OR returned
        // 404 (account no longer accessible — silent branch 1
        // transition per design §9.3).
        <CardBody>
          <EmptyState
            title="Sin datos"
            description={
              flow === null
                ? `La cuenta seleccionada ya no está disponible.`
                : `La cuenta seleccionada no registró movimientos durante ${month}.`
            }
          />
        </CardBody>
      )}
    </Card>
  );
}
