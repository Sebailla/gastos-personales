/**
 * MonthlySummaryCard — pure render Server Component (slice 4
 * T-UI-306, originally T-RPT-303).
 *
 * Per design §7.3 + §9.3 + REQ-UI-3:
 * - Card compound (Card + CardHeader + CardBody + CardFooter)
 *   consuming the design-system primitives.
 * - CardHeader: title "Resumen mensual" + a Badge carrying
 *   the UTC month label (so the (UTC) marker stays visible to
 *   the user without re-rendering it in the body).
 * - CardBody: populated branch renders a Table primitive with
 *   the totals rows (Currency / Ingresos / Gastos / Neto / #).
 *   Empty branch renders an EmptyState primitive (per REQ-UI-3,
 *   with a CTA linking to `/transactions/new`).
 * - CardFooter: on the empty branch, the CTA sits in the
 *   footer so the visual hierarchy matches the other two
 *   cards. On the populated branch, the footer is omitted
 *   (no action needed).
 *
 * The currency column carries `convertedCurrency`
 * (BR-RPT-1 / BR-ACC-12) — never the raw transaction
 * currency. The (UTC) marker explains the bucketing
 * decision (BR-RPT-3, design §3.6): every totals row groups
 * transactions by `convertedCurrency` within a calendar
 * month anchored at UTC midnight. The same UTC day boundary
 * is used by the Month value object
 * (`src/modules/reports/domain/value-objects/month.ts`) and
 * the Prisma adapter.
 *
 * No `'use client'` directive. The component is a pure
 * render Server Component that takes the pre-fetched DTO as
 * a prop; the dashboard page owns the data fetch
 * (API-first pattern, architecture-standards rule).
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
import { Link } from '../_ui/primitives/link';
import type { MonthlySummaryDTO } from '../_lib/report-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  summary: MonthlySummaryDTO;
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

const TOTALS_COLUMNS: ReadonlyArray<TableColumn> = [
  { key: 'currency', label: 'Currency' },
  { key: 'income', label: 'Ingresos' },
  { key: 'expense', label: 'Gastos' },
  { key: 'net', label: 'Neto' },
  { key: 'count', label: '#' },
];

export function MonthlySummaryCard({ summary, month }: Props): React.JSX.Element {
  const isEmpty = summary.totals.length === 0;
  return (
    <Card aria-label={`Resumen mensual ${month}`}>
      <CardHeader
        title="Resumen mensual"
        badge={<Badge variant="neutral">{month} (UTC)</Badge>}
      />
      {isEmpty ? (
        <CardBody>
          <EmptyState
            title="Sin datos"
            description="Aún no tenés transacciones registradas para este mes."
            cta={
              <Link
                href="/transactions/new"
                className="rounded-ui-md bg-ui-accent px-ui-space-4 py-ui-space-2 text-ui-text-sm font-ui-font-medium text-ui-accent-fg hover:bg-ui-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2"
              >
                Registrar primera transacción
              </Link>
            }
          />
        </CardBody>
      ) : (
        <>
          <CardBody>
            <Table caption="Resumen mensual — totales por moneda convertida">
              <TableHeader columns={TOTALS_COLUMNS} />
              <TableBody>
                {summary.totals.map((t) => (
                  <TableRow key={t.convertedCurrency}>
                    <TableCell>{t.convertedCurrency}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(t.incomeMinor, t.convertedCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(t.expenseMinor, t.convertedCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(t.netMinor, t.convertedCurrency)}
                    </TableCell>
                    <TableCell className="text-right">{t.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
          <CardFooter>
            <span className="text-ui-text-xs text-ui-fg-muted">
              Período {month} (UTC). Mostrando totales por moneda convertida.
            </span>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
