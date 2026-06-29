/**
 * MonthlySummaryCard — async Server Component (FIX 2 — 4R review).
 *
 * Refactored in `fix/ui-4r-cleanup` to be self-fetching so the
 * dashboard page can wrap it in its own `<Suspense>` boundary.
 * Per design §16.5 + §17: each card owns its fetch; a thrown
 * fetch error stays within the card's boundary and the sibling
 * cards continue to render.
 *
 * The card fetches `/api/reports/monthly?month=<month>` via the
 * Server-Component-safe `serverHonoRequest` helper. The response
 * is parsed through Zod to surface drift as a parse error rather
 * than a silent type mismatch on the consumer (architecture-
 * standards rule). Non-200 responses throw so the per-card
 * `<Suspense>` fallback renders; the other two cards stay alive.
 *
 * The render branches (empty / populated) are unchanged from the
 * pre-FIX-2 version: the populated branch renders the totals
 * Table, the empty branch renders the EmptyState with a CTA to
 * `/transactions/new` (REQ-UI-3).
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
import { Link } from '../_ui/primitives/link';
import { serverHonoRequest } from '@/lib/server-hono';
import type { MonthlySummaryDTO } from '../_lib/report-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

// Local response schema — mirrors `app/_lib/report-types.ts`.
// The UI cannot import the application DTO from `src/modules/...`
// per the API-first rule. Drift between the DTO mapper and this
// schema surfaces as a Zod parse error on every page load, not
// as a silent type mismatch on the consumer.
const monthlySummaryResponseSchema: z.ZodType<MonthlySummaryDTO> = z.object({
  totals: z.array(
    z.object({
      convertedCurrency: z.string(),
      incomeMinor: z.number(),
      expenseMinor: z.number(),
      netMinor: z.number(),
      count: z.number(),
    }),
  ),
  generatedAt: z.string(),
});

const TOTALS_COLUMNS: ReadonlyArray<TableColumn> = [
  { key: 'currency', label: 'Currency' },
  { key: 'income', label: 'Ingresos' },
  { key: 'expense', label: 'Gastos' },
  { key: 'net', label: 'Neto' },
  { key: 'count', label: '#' },
];

async function fetchMonthlySummary(month: string): Promise<MonthlySummaryDTO> {
  const res = await serverHonoRequest(`/api/reports/monthly?month=${month}`);
  if (!res.ok) {
    // Non-2xx surfaces as a thrown error so the per-card
    // <Suspense> boundary catches it (FIX 2 — design §16.5).
    const body = await res.json().catch(() => null);
    const message = body?.error?.message ?? `monthly failed (${res.status})`;
    throw new Error(message);
  }
  return monthlySummaryResponseSchema.parse(await res.json());
}

export async function MonthlySummaryCard({ month }: Props): Promise<React.JSX.Element> {
  let summary: MonthlySummaryDTO;
  try {
    summary = await fetchMonthlySummary(month);
  } catch (err) {
    // FIX 2 — per-card failure isolation. A thrown fetch error
    // MUST stay inside this card's Suspense boundary so the
    // sibling cards continue to render. We render an in-card
    // error surface (CardHeader + role="alert") instead of
    // letting the error bubble up to the dashboard's segment
    // error.tsx (which would tear down the whole page).
    const message = err instanceof Error ? err.message : 'No pudimos cargar el resumen mensual.';
    return (
      <Card aria-label={`Resumen mensual ${month} — error`}>
        <CardHeader
          title="Resumen mensual"
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
  const isEmpty = summary.totals.length === 0;
  return (
    <Card aria-label={`Resumen mensual ${month}`}>
      <CardHeader title="Resumen mensual" badge={<Badge variant="neutral">{month} (UTC)</Badge>} />
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
