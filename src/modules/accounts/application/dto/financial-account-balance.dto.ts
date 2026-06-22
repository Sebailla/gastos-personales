/**
 * DTOs for the balance endpoint response shape.
 *
 * The balance endpoint returns the spec's
 * `{ native, display, stale, warnings? }` shape (BR-ACC-12 +
 * BR-FX-6). The DTOs mirror the domain `FxConversionResult`
 * and convert `Date` to ISO 8601 for the wire.
 *
 * PR-3 T3.5 additions:
 * - `stale: boolean` is now REQUIRED on the wire (was
 *   optional in PR-1). The widget reads it to decide
 *   whether to render the amber chip.
 * - The `warnings?` array is propagated verbatim. The
 *   provider emits `["FX rate is stale; showing last known
 *   value."]` when `stale === true`. The widget uses the
 *   array (not just the boolean) for the chip's tooltip
 *   surface.
 */

import type { FxConversionResult } from '../../domain/interfaces/fx-rate-provider.port';

export interface FinancialAccountBalanceDto {
  native: { amount: number; currency: string };
  display: { amount: number; currency: string; fxRate: number; fxAsOf: string };
  stale: boolean;
  warnings?: string[];
}

export function toBalanceDto(result: FxConversionResult): FinancialAccountBalanceDto {
  return {
    native: {
      amount: result.native.amount,
      currency: result.native.currency,
    },
    display: {
      amount: result.display.amount,
      currency: result.display.currency,
      fxRate: result.display.fxRate,
      fxAsOf: result.display.fxAsOf.toISOString(),
    },
    stale: result.stale,
    ...(result.warnings !== undefined && result.warnings.length > 0
      ? { warnings: result.warnings }
      : {}),
  };
}
