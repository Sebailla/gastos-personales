/**
 * CategoryBreakdownCard — pure render Server Component
 * (slice 4 T-UI-307, originally T-RPT-304).
 *
 * Per design §7.3 + §9.3 + REQ-UI-3:
 * - Card compound (Card + CardHeader + CardBody) consuming
 *   the design-system primitives.
 * - CardHeader: title "Por categoría" + Badge carrying the
 *   UTC month label.
 * - CardBody populated: Table primitive with bucket rows
 *   (Categoría / Monto / Tx). The domain factory already
 *   sorts by `amountMinor DESC` primary + `categoryNormalized
 *   ASC` secondary (BR-RPT-2); the component renders rows in
 *   input order (trusts the wire shape).
 * - CardBody empty: EmptyState primitive.
 *
 * Surface the NORMALIZED category label; the raw `category`
 * field is preserved on the DTO for debugging but the
 * production UI displays the normalized form (BR-RPT-2).
 *
 * The (UTC) marker explains the bucketing decision
 * (BR-RPT-3, design §3.6): every bucket groups transactions
 * by `(categoryNormalized, convertedCurrency)` within a
 * calendar month anchored at UTC midnight.
 *
 * No `'use client'` directive. Pure render Server Component.
 */

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
import type { CategoryBreakdownDTO } from '../_lib/report-types';
import { formatMinor } from '../_lib/format-minor';

interface Props {
  breakdown: CategoryBreakdownDTO;
  month: string; // YYYY-MM (UTC month, per BR-RPT-3)
}

const BUCKETS_COLUMNS: ReadonlyArray<TableColumn> = [
  { key: 'category', label: 'Categoría' },
  { key: 'amount', label: 'Monto' },
  { key: 'count', label: 'Tx' },
];

export function CategoryBreakdownCard({ breakdown, month }: Props): React.JSX.Element {
  const isEmpty = breakdown.buckets.length === 0;
  return (
    <Card aria-label={`Desglose por categoría ${month}`}>
      <CardHeader
        title="Por categoría"
        badge={<Badge variant="neutral">{month} (UTC)</Badge>}
      />
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
