/**
 * Tests for `toCategoryBreakdownDto` (T-RPT-111).
 *
 * Slice 2 deliverable — DTO mapper tests for the
 * category-breakdown wire shape. Covers:
 *   (1) Date stringification (Date → ISO-8601 string).
 *   (2) null preservation (`category: null` is preserved
 *       verbatim per BR-RPT-2 — the raw string from the
 *       Transaction row).
 *   (3) round-trip through the factory (the mapper does NOT
 *       re-sort or re-normalize; the factory's output is
 *       already sorted).
 */

import { describe, it, expect } from 'vitest';
import { toCategoryBreakdownDto } from './category-breakdown.dto';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { CategoryBreakdown } from '../../domain/aggregates/category-breakdown';

function makeBreakdown(overrides: Partial<CategoryBreakdown> = {}): CategoryBreakdown {
  const generatedAt = new Date('2026-06-15T12:34:56.000Z');
  return {
    userId: 'u1',
    year: 2026,
    month: 6,
    buckets: [
      {
        category: null,
        categoryNormalized: 'uncategorized',
        convertedCurrency: AccountCurrency.ARS,
        amountMinor: 1000,
        txCount: 1,
      },
      {
        category: 'Rent',
        categoryNormalized: 'rent',
        convertedCurrency: AccountCurrency.USD,
        amountMinor: -50000,
        txCount: 3,
      },
    ],
    generatedAt,
    ...overrides,
  };
}

describe('toCategoryBreakdownDto', () => {
  it('stringifies generatedAt as ISO-8601', () => {
    const dto = toCategoryBreakdownDto(makeBreakdown());
    expect(dto.generatedAt).toBe('2026-06-15T12:34:56.000Z');
  });

  it('preserves null category verbatim (no stringification)', () => {
    const dto = toCategoryBreakdownDto(makeBreakdown());
    expect(dto.buckets[0]?.category).toBeNull();
    expect(dto.buckets[1]?.category).toBe('Rent');
  });

  it('preserves bucket sort and minor units (round-trip)', () => {
    const dto = toCategoryBreakdownDto(makeBreakdown());
    expect(dto.buckets).toEqual([
      {
        category: null,
        categoryNormalized: 'uncategorized',
        convertedCurrency: 'ARS',
        amountMinor: 1000,
        txCount: 1,
      },
      {
        category: 'Rent',
        categoryNormalized: 'rent',
        convertedCurrency: 'USD',
        amountMinor: -50000,
        txCount: 3,
      },
    ]);
  });

  it('handles the empty state (buckets: []) without synthesising fields', () => {
    const dto = toCategoryBreakdownDto(makeBreakdown({ buckets: [] }));
    expect(dto.buckets).toEqual([]);
    expect(typeof dto.generatedAt).toBe('string');
    expect(dto.generatedAt).toBe('2026-06-15T12:34:56.000Z');
  });
});
