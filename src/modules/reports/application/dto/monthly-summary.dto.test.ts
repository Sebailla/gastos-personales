/**
 * Tests for `toMonthlySummaryDto` (T-RPT-111).
 *
 * Slice 2 deliverable — DTO mapper tests for the
 * monthly-summary wire shape. Covers:
 *   (1) Date stringification (Date → ISO-8601 string).
 *   (2) null preservation (verified via `totals: []` empty
 *       state; the mapper never synthesizes `null` for the
 *       date field).
 *   (3) round-trip through the factory (the mapper does NOT
 *       alter counts, netMinor, or convertedCurrency).
 */

import { describe, it, expect } from 'vitest';
import { toMonthlySummaryDto } from './monthly-summary.dto';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { MonthlySummary } from '../../domain/aggregates/monthly-summary';

function makeSummary(overrides: Partial<MonthlySummary> = {}): MonthlySummary {
  const generatedAt = new Date('2026-06-15T12:34:56.000Z');
  return {
    userId: 'u1',
    year: 2026,
    month: 6,
    totals: [
      {
        convertedCurrency: AccountCurrency.ARS,
        incomeMinor: 100000,
        expenseMinor: 50000,
        netMinor: 50000,
        count: 3,
      },
      {
        convertedCurrency: AccountCurrency.USD,
        incomeMinor: 0,
        expenseMinor: 2500,
        netMinor: -2500,
        count: 1,
      },
    ],
    generatedAt,
    ...overrides,
  };
}

describe('toMonthlySummaryDto', () => {
  it('stringifies generatedAt as ISO-8601', () => {
    const dto = toMonthlySummaryDto(makeSummary());
    expect(dto.generatedAt).toBe('2026-06-15T12:34:56.000Z');
  });

  it('preserves convertedCurrency verbatim', () => {
    const dto = toMonthlySummaryDto(makeSummary());
    expect(dto.totals.map((t) => t.convertedCurrency)).toEqual(['ARS', 'USD']);
  });

  it('preserves minor-unit counts and net values (round-trip)', () => {
    const dto = toMonthlySummaryDto(makeSummary());
    expect(dto.totals[0]).toEqual({
      convertedCurrency: 'ARS',
      incomeMinor: 100000,
      expenseMinor: 50000,
      netMinor: 50000,
      count: 3,
    });
    expect(dto.totals[1]).toEqual({
      convertedCurrency: 'USD',
      incomeMinor: 0,
      expenseMinor: 2500,
      netMinor: -2500,
      count: 1,
    });
  });

  it('handles the empty state (totals: []) without synthesising dates', () => {
    const dto = toMonthlySummaryDto(makeSummary({ totals: [] }));
    expect(dto.totals).toEqual([]);
    expect(typeof dto.generatedAt).toBe('string');
    expect(dto.generatedAt).toBe('2026-06-15T12:34:56.000Z');
  });
});
