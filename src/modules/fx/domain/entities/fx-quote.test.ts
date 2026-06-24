import { describe, it, expect } from 'vitest';
import { fxQuoteSchema, isFxQuote, type FxQuote } from './fx-quote';

describe('fxQuoteSchema', () => {
  it('accepts a valid quote for the oficial casa', () => {
    const parsed = fxQuoteSchema.parse({
      casa: 'oficial',
      buy: 1180,
      sell: 1220,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    });
    expect(parsed).toEqual({
      casa: 'oficial',
      buy: 1180,
      sell: 1220,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    });
  });

  it('rejects negative buy', () => {
    const result = fxQuoteSchema.safeParse({
      casa: 'oficial',
      buy: -1,
      sell: 1220,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero sell', () => {
    const result = fxQuoteSchema.safeParse({
      casa: 'oficial',
      buy: 1180,
      sell: 0,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-ISO fxAsOf', () => {
    const result = fxQuoteSchema.safeParse({
      casa: 'oficial',
      buy: 1180,
      sell: 1220,
      fxAsOf: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown casa', () => {
    const result = fxQuoteSchema.safeParse({
      casa: 'unknown',
      buy: 1180,
      sell: 1220,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a future-dated fxAsOf (future quotes cannot exist)', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = fxQuoteSchema.safeParse({
      casa: 'oficial',
      buy: 1180,
      sell: 1220,
      fxAsOf: future,
    });
    expect(result.success).toBe(false);
  });
});

describe('isFxQuote type-guard', () => {
  it('returns true for a valid quote', () => {
    const candidate: unknown = {
      casa: 'blue',
      buy: 1100,
      sell: 1140,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    };
    const guard: FxQuote | null = isFxQuote(candidate) ? (candidate as FxQuote) : null;
    expect(guard).not.toBeNull();
    expect(guard?.casa).toBe('blue');
  });

  it('returns false for an invalid quote', () => {
    const candidate: unknown = {
      casa: 'blue',
      buy: -1,
      sell: 1140,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    };
    expect(isFxQuote(candidate)).toBe(false);
  });
});
