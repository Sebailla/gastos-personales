/**
 * Tests for `toAccountFlowDto` (T-RPT-111).
 *
 * Slice 2 deliverable — DTO mapper tests for the
 * account-flow wire shape. Covers:
 *   (1) Date stringification (Date → ISO-8601 string for
 *       `fromDate`, `toDate`, `generatedAt`).
 *   (2) `date` key preserved as `YYYY-MM-DD` (the factory
 *       already derives the UTC midnight date string; the
 *       mapper does NOT re-format).
 *   (3) round-trip through the factory (the mapper does NOT
 *       re-sort or re-anchor; the factory's output is the
 *       wire shape minus ISO-8601 conversion).
 */

import { describe, it, expect } from 'vitest';
import { toAccountFlowDto } from './account-flow.dto';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { AccountFlow } from '../../domain/aggregates/account-flow';

function makeFlow(overrides: Partial<AccountFlow> = {}): AccountFlow {
  return {
    userId: 'u1',
    accountId: 'c1234567890abcdef1234567z',
    fromDate: new Date('2026-06-01T00:00:00.000Z'),
    toDate: new Date('2026-06-30T23:59:59.999Z'),
    days: [
      {
        date: '2026-06-01',
        netMinor: 1000,
        runningBalanceMinor: 1000,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
      {
        date: '2026-06-03',
        netMinor: -500,
        runningBalanceMinor: 500,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
    ],
    generatedAt: new Date('2026-06-15T12:34:56.000Z'),
    ...overrides,
  };
}

describe('toAccountFlowDto', () => {
  it('stringifies fromDate, toDate, generatedAt as ISO-8601', () => {
    const dto = toAccountFlowDto(makeFlow());
    expect(dto.fromDate).toBe('2026-06-01T00:00:00.000Z');
    expect(dto.toDate).toBe('2026-06-30T23:59:59.999Z');
    expect(dto.generatedAt).toBe('2026-06-15T12:34:56.000Z');
  });

  it('preserves YYYY-MM-DD date keys verbatim', () => {
    const dto = toAccountFlowDto(makeFlow());
    expect(dto.days.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-03']);
  });

  it('preserves running balance + sparse-day omission (round-trip)', () => {
    const dto = toAccountFlowDto(makeFlow());
    expect(dto.days).toEqual([
      {
        date: '2026-06-01',
        netMinor: 1000,
        runningBalanceMinor: 1000,
        count: 1,
        convertedCurrency: 'ARS',
      },
      {
        date: '2026-06-03',
        netMinor: -500,
        runningBalanceMinor: 500,
        count: 1,
        convertedCurrency: 'ARS',
      },
    ]);
  });

  it('handles the empty state (days: [])', () => {
    const dto = toAccountFlowDto(makeFlow({ days: [] }));
    expect(dto.days).toEqual([]);
    expect(dto.fromDate).toBe('2026-06-01T00:00:00.000Z');
    expect(dto.toDate).toBe('2026-06-30T23:59:59.999Z');
    expect(typeof dto.generatedAt).toBe('string');
  });
});
