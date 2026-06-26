/**
 * Unit tests: `Month` value object.
 *
 * Slice 1 / T-RPT-011 (GREEN). The value object parses the wire
 * `YYYY-MM` string, enforces regex + bounds, and derives the UTC
 * `fromDate` / `toDate` window.
 */
import { describe, it, expect } from 'vitest';
import { parseMonth } from './month';
import { InvalidMonthError } from '../errors/invalid-month-error';

describe('Month value object — reports slice 1', () => {
  it('parses 2026-06 and returns the bounded value object', () => {
    const m = parseMonth('2026-06');
    expect(m.monthString).toBe('2026-06');
    expect(m.year).toBe(2026);
    expect(m.month).toBe(6);
    expect(m.fromDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(m.toDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('handles month=12 roll-over to the next year (December 2026)', () => {
    const m = parseMonth('2026-12');
    expect(m.month).toBe(12);
    expect(m.fromDate.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(m.toDate.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('handles month=01 (January 2026) — toDate is exclusive upper bound', () => {
    const m = parseMonth('2026-01');
    expect(m.month).toBe(1);
    expect(m.fromDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(m.toDate.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('rejects strings that fail the regex (not YYYY-MM shape)', () => {
    expect(() => parseMonth('foo')).toThrow(InvalidMonthError);
    expect(() => parseMonth('2026-6')).toThrow(InvalidMonthError);
    expect(() => parseMonth('26-06')).toThrow(InvalidMonthError);
    expect(() => parseMonth('2026/06')).toThrow(InvalidMonthError);
    expect(() => parseMonth('')).toThrow(InvalidMonthError);
  });

  it('rejects month > 12', () => {
    expect(() => parseMonth('2026-13')).toThrow(InvalidMonthError);
  });

  it('rejects month < 1 (the regex would reject 2026-00)', () => {
    expect(() => parseMonth('2026-00')).toThrow(InvalidMonthError);
  });

  it('rejects year outside 2000..2100', () => {
    expect(() => parseMonth('1999-06')).toThrow(InvalidMonthError);
    expect(() => parseMonth('2101-06')).toThrow(InvalidMonthError);
  });

  it('boundary years are accepted (2000 and 2100)', () => {
    const min = parseMonth('2000-01');
    expect(min.year).toBe(2000);
    const max = parseMonth('2100-12');
    expect(max.year).toBe(2100);
  });
});
