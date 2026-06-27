/**
 * DTOs for `AccountFlow`.
 *
 * Slice 2 deliverable — wire shape returned by
 * `GET /api/reports/accounts/:accountId/flow`. The mapper
 * is mechanical (design §5.7):
 *
 *   - `Date` fields (`generatedAt`, `fromDate`, `toDate`)
 *     → ISO-8601 string.
 *   - `AccountFlowDay.date` is preserved verbatim (already
 *     a `YYYY-MM-DD` UTC key by the factory's aggregator).
 *   - `convertedCurrency` is preserved verbatim.
 *
 * Every field is `readonly`. The DTO surface mirrors the
 * public output; the UI (slice 4) and any future consumer
 * read the wire shape and never see the domain aggregate
 * directly.
 *
 * Cross-cutting invariants (carried from design §3.4.1):
 * - BR-RPT-3: `date` keys are `YYYY-MM-DD` UTC; sparse days
 *   omitted.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no
 *   FX call in the read path.
 */

import type {
  AccountFlow,
  AccountFlowDay,
} from '../../domain/aggregates/account-flow';

export interface AccountFlowDTO {
  readonly fromDate: string; // ISO 8601
  readonly toDate: string; // ISO 8601
  readonly days: readonly AccountFlowDayDTO[];
  readonly generatedAt: string; // ISO 8601
}

export interface AccountFlowDayDTO {
  readonly date: AccountFlowDay['date'];
  readonly netMinor: number;
  readonly runningBalanceMinor: number;
  readonly count: number;
  readonly convertedCurrency: AccountFlowDay['convertedCurrency'];
}

export function toAccountFlowDto(flow: AccountFlow): AccountFlowDTO {
  return {
    fromDate: flow.fromDate.toISOString(),
    toDate: flow.toDate.toISOString(),
    days: flow.days.map((d) => ({
      date: d.date,
      netMinor: d.netMinor,
      runningBalanceMinor: d.runningBalanceMinor,
      count: d.count,
      convertedCurrency: d.convertedCurrency,
    })),
    generatedAt: flow.generatedAt.toISOString(),
  };
}
