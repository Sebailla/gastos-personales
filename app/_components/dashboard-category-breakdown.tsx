/**
 * CategoryBreakdownCard — async Server Component (FIX 2 — 4R review).
 *
 * Refactored in `fix/ui-4r-cleanup` to be self-fetching so the
 * dashboard page can wrap it in its own `<Suspense>` boundary.
 * Per design §16.5 + §17: each card owns its fetch; a thrown
 * fetch error stays within the card's boundary and the sibling
 * cards continue to render.
 *
 * The card fetches `/api/reports/breakdown?month=<month>` via
 * the Server-Component-safe `serverHonoRequest` helper. The
 * response is parsed through Zod to surface drift as a parse
 * error rather than a silent type mismatch on the consumer.
 *
 * The render branches (empty / populated) are unchanged from the
 * pre-FIX-2 version. Domain sorting is the wire shape's job
 * (BR-RPT-2): the factory sorts by `amountMinor DESC` primary +
 * `categoryNormalized ASC` secondary. The component renders rows
 * in input order and trusts the wire shape.
 *
 * No `'use client'` directive. Pure async Server Component.
 */

import { z } from 'zod';
import { Card, CardHeader, CardBody } from '../_ui/primitives/card';
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
import { serverHonoRequest } from '@/lib/server-hono';
import type { CategoryBreakdownDTO } from '../_lib/report-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

const categoryBreakdownResponseSchema: z.ZodType<CategoryBreakdownDTO> = z.object({
  buckets: z.array(
    z.object({
      category: z.string().nullable(),
      categoryNormalized: z.string(),
      convertedCurrency: z.string(),
      amountMinor: z.number(),
      txCount: z.number(),
    }),
  ),
  generatedAt: z.string(),
});

const BUCKETS_COLUMNS: ReadonlyArray<TableColumn> = [
  { key: 'category', label: 'Categoría' },
  { key: 'amount', label: 'Monto' },
  { key: 'count', label: 'Tx' },
];

async function fetchCategoryBreakdown(month: string): Promise<CategoryBreakdownDTO> {
  const res = await serverHonoRequest(`/api/reports/breakdown?month=${month}`);
  if (!res.ok) {
    // Non-2xx surfaces as a thrown error so the per-card
    // <Suspense> boundary catches it (FIX 2 — design §16.5).
    const body = await res.json().catch(() => null);
    const message = body?.error?.message ?? `breakdown failed (${res.status})`;
    throw new Error(message);
  }
  return categoryBreakdownResponseSchema.parse(await res.json());
}

export async function CategoryBreakdownCard({ month }: Props): Promise<React.JSX.Element> {
  let breakdown: CategoryBreakdownDTO;
  try {
    breakdown = await fetchCategoryBreakdown(month);
  } catch (err) {
    // FIX 2 — per-card failure isolation (see MonthlySummaryCard
    // for the full rationale). The breakdown card renders its
    // own error surface inside the Card primitive so the
    // sibling cards (Resumen mensual + Flujo por cuenta)
    // continue to render.
    const message =
      err instanceof Error ? err.message : 'No pudimos cargar el desglose por categoría.';
    return (
      <Card aria-label={`Desglose por categoría ${month} — error`}>
        <CardHeader title="Por categoría" badge={<Badge variant="neutral">{month} (UTC)</Badge>} />
        <CardBody>
          <div role="alert" className="text-ui-text-sm text-ui-fg">
            {message}
          </div>
        </CardBody>
      </Card>
    );
  }
  const isEmpty = breakdown.buckets.length === 0;
  return (
    <Card aria-label={`Desglose por categoría ${month}`}>
      <CardHeader title="Por categoría" badge={<Badge variant="neutral">{month} (UTC)</Badge>} />
      {isEmpty ? (
        <CardBody>
          <EmptyState
            title="Sin datos"
            description="No hay transacciones categorizadas para este mes."
          />
        </CardBody>
      ) : (
        <CardBody>
          <Table caption="Desglose por categoría — totales por bucket (moneda convertida)">
            <TableHeader columns={BUCKETS_COLUMNS} />
            <TableBody>
              {breakdown.buckets.map((b) => (
                <TableRow key={`${b.categoryNormalized}-${b.convertedCurrency}`}>
                  <TableCell>{b.categoryNormalized}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMinor(b.amountMinor, b.convertedCurrency)}
                  </TableCell>
                  <TableCell className="text-right">{b.txCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      )}
    </Card>
  );
}
