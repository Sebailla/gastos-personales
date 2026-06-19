import { describe, it, expect } from 'vitest';
import { OpeningBalance } from './opening-balance';
import { AppError } from '@/shared/errors/app-error';

describe('OpeningBalance.fresh factory', () => {
  it('returns { mode: FRESH, amountMinor, date: null }', () => {
    const ob = OpeningBalance.fresh(0);
    expect(ob).toEqual({ mode: 'FRESH', amountMinor: 0, date: null });
  });

  it('accepts a positive amountMinor', () => {
    const ob = OpeningBalance.fresh(12345);
    expect(ob.amountMinor).toBe(12345);
  });
});

describe('OpeningBalance.historical factory', () => {
  it('returns { mode: HISTORICAL, amountMinor, date } for a past date', () => {
    const date = new Date('2025-01-15T00:00:00.000Z');
    const ob = OpeningBalance.historical(date, 50000);
    expect(ob.mode).toBe('HISTORICAL');
    expect(ob.amountMinor).toBe(50000);
    expect(ob.date).toEqual(date);
  });

  it('throws AppError(VALIDATION_ERROR) when amountMinor is negative', () => {
    const date = new Date('2025-01-15T00:00:00.000Z');
    expect(() => OpeningBalance.historical(date, -1)).toThrow(AppError);
  });
});

describe('OpeningBalance invariant: amountMinor >= 0', () => {
  it('rejects a negative amount in fresh()', () => {
    expect(() => OpeningBalance.fresh(-100)).toThrow(/non-negative/);
  });

  it('accepts an amount of exactly 0 (boundary case)', () => {
    // Boundary: 0 is the smallest valid amount. fresh() and historical()
    // must both accept it without throwing.
    expect(() => OpeningBalance.fresh(0)).not.toThrow();
    expect(() => OpeningBalance.historical(new Date('2025-01-01T00:00:00.000Z'), 0)).not.toThrow();
  });
});

describe('OpeningBalance invariant: date validity', () => {
  it('rejects a date in the future', () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // +1 year
    expect(() => OpeningBalance.historical(future, 100)).toThrow(/future/);
  });

  it('rejects a missing/invalid date', () => {
    expect(() => OpeningBalance.historical(new Date('invalid'), 100)).toThrow();
  });
});
