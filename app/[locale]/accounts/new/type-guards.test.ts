/**
 * Tests for `app/accounts/new/type-guards.ts`.
 *
 * The guards replace 6 unsafe `e.target.value as T` casts in
 * `create-account-form.tsx` (root AGENTS.md §10.5 — "No `as`").
 * Each guard narrows a runtime `string` against the literal
 * union; invalid input must fall back to the caller-supplied
 * default (or `null` for `parseCasaOrNull`).
 *
 * Coverage:
 * - Each `isX` predicate returns `true` for every literal in
 *   its union + `false` for an empty string + `false` for an
 *   arbitrary unknown string (defense-in-depth: a noisy
 *   browser extension or programmatic event cannot poison the
 *   form state).
 * - Each `parseX(value, fallback)` returns the parsed value
 *   on a hit and the caller-supplied fallback on a miss (or
 *   empty input, which mirrors `<Select>` initial render with
 *   no selection).
 * - `parseCasaOrNull('')` returns `null` (the casa select's
 *   "Default (oficial)" sentinel), unknown strings also
 *   return `null` (defense-in-depth), valid CASAS return
 *   narrowed.
 *
 * Style: no `for` loops in tests (root AGENTS.md §10.5 "No
 * logic in tests"). One `expect` per `it` so each case has a
 * named, individually reportable failure.
 */

import { describe, it, expect } from 'vitest';
import {
  TYPES,
  CURRENCIES,
  ACCOUNT_KINDS,
  INVESTMENT_TYPES,
  CASAS,
  OPENING_BALANCE_MODES,
  isAccountType,
  isAccountCurrency,
  isAccountKind,
  isInvestmentType,
  isCasa,
  isOpeningBalanceMode,
  parseAccountType,
  parseAccountCurrency,
  parseAccountKind,
  parseInvestmentType,
  parseCasaOrNull,
  parseOpeningBalanceMode,
} from './type-guards';

describe('isAccountType', () => {
  it.each(TYPES)('returns true for the literal "%s"', (v) => {
    expect(isAccountType(v)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isAccountType('')).toBe(false);
  });

  it('is case-sensitive — returns false for lowercase "bank"', () => {
    expect(isAccountType('bank')).toBe(false);
  });

  it('returns false for an unknown token', () => {
    expect(isAccountType('BOGUS')).toBe(false);
  });

  it('returns false for a path-injection attempt', () => {
    expect(isAccountType('../../etc/passwd')).toBe(false);
  });
});

describe('isAccountCurrency', () => {
  it.each(CURRENCIES)('returns true for the literal "%s"', (v) => {
    expect(isAccountCurrency(v)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isAccountCurrency('')).toBe(false);
  });

  it('is case-sensitive — returns false for lowercase "ars"', () => {
    expect(isAccountCurrency('ars')).toBe(false);
  });

  it('returns false for an unknown ISO code', () => {
    expect(isAccountCurrency('XYZ')).toBe(false);
  });
});

describe('isAccountKind', () => {
  it.each(ACCOUNT_KINDS)('returns true for the literal "%s"', (v) => {
    expect(isAccountKind(v)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isAccountKind('')).toBe(false);
  });

  it('returns false for "CURRENT" (legacy token, not in the enum)', () => {
    expect(isAccountKind('CURRENT')).toBe(false);
  });

  it('is case-sensitive — returns false for lowercase "savings"', () => {
    expect(isAccountKind('savings')).toBe(false);
  });
});

describe('isInvestmentType', () => {
  it.each(INVESTMENT_TYPES)('returns true for the literal "%s"', (v) => {
    expect(isInvestmentType(v)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isInvestmentType('')).toBe(false);
  });

  it('returns false for the singular "STOCK"', () => {
    expect(isInvestmentType('STOCK')).toBe(false);
  });

  it('returns false for "CRYPTO" (not in the enum)', () => {
    expect(isInvestmentType('CRYPTO')).toBe(false);
  });
});

describe('isCasa', () => {
  it.each(CASAS)('returns true for the literal "%s"', (v) => {
    expect(isCasa(v)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isCasa('')).toBe(false);
  });

  it('is case-sensitive — returns false for lowercase "blue"', () => {
    expect(isCasa('blue')).toBe(false);
  });

  it('returns false for an unknown token', () => {
    expect(isCasa('BOGUS')).toBe(false);
  });
});

describe('isOpeningBalanceMode', () => {
  it.each(OPENING_BALANCE_MODES)('returns true for the literal "%s"', (v) => {
    expect(isOpeningBalanceMode(v)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isOpeningBalanceMode('')).toBe(false);
  });

  it('is case-sensitive — returns false for lowercase "fresh"', () => {
    expect(isOpeningBalanceMode('fresh')).toBe(false);
  });

  it('returns false for the legacy token "CURRENT"', () => {
    expect(isOpeningBalanceMode('CURRENT')).toBe(false);
  });
});

describe('parseAccountType', () => {
  it('returns the value on a hit', () => {
    expect(parseAccountType('BANK', 'CREDIT')).toBe('BANK');
  });

  it('returns the fallback on an empty string', () => {
    expect(parseAccountType('', 'CREDIT')).toBe('CREDIT');
  });

  it('returns the fallback on an unknown token', () => {
    expect(parseAccountType('BOGUS', 'CREDIT')).toBe('CREDIT');
  });

  it('returns the fallback on a case-mismatched value', () => {
    expect(parseAccountType('bank', 'INVESTMENT')).toBe('INVESTMENT');
  });
});

describe('parseAccountCurrency', () => {
  it('returns the value on a hit', () => {
    expect(parseAccountCurrency('USD', 'ARS')).toBe('USD');
  });

  it('returns the fallback on an empty string', () => {
    expect(parseAccountCurrency('', 'ARS')).toBe('ARS');
  });

  it('returns the fallback on an unknown ISO code', () => {
    expect(parseAccountCurrency('XYZ', 'EUR')).toBe('EUR');
  });
});

describe('parseAccountKind', () => {
  it('returns the value on a hit', () => {
    expect(parseAccountKind('CHECKING', 'SAVINGS')).toBe('CHECKING');
  });

  it('returns the fallback on an empty string', () => {
    expect(parseAccountKind('', 'SAVINGS')).toBe('SAVINGS');
  });

  it('returns the fallback on an unknown token', () => {
    expect(parseAccountKind('CURRENT', 'SAVINGS')).toBe('SAVINGS');
  });
});

describe('parseInvestmentType', () => {
  it('returns the value on a hit', () => {
    expect(parseInvestmentType('BONDS', 'STOCKS')).toBe('BONDS');
  });

  it('returns the fallback on an empty string', () => {
    expect(parseInvestmentType('', 'STOCKS')).toBe('STOCKS');
  });

  it('returns the fallback on an unknown token', () => {
    expect(parseInvestmentType('STOCK', 'STOCKS')).toBe('STOCKS');
  });
});

describe('parseCasaOrNull', () => {
  it('returns null on the empty sentinel (Default inheritance)', () => {
    expect(parseCasaOrNull('')).toBeNull();
  });

  it('returns null on an unknown token (defense-in-depth)', () => {
    expect(parseCasaOrNull('BOGUS')).toBeNull();
  });

  it('returns null on a case-mismatched token', () => {
    expect(parseCasaOrNull('blue')).toBeNull();
  });

  it('returns the narrowed Casa for "OFICIAL"', () => {
    expect(parseCasaOrNull('OFICIAL')).toBe('OFICIAL');
  });

  it('returns the narrowed Casa for "BLUE"', () => {
    expect(parseCasaOrNull('BLUE')).toBe('BLUE');
  });
});

describe('parseOpeningBalanceMode', () => {
  it('returns the value on a hit', () => {
    expect(parseOpeningBalanceMode('HISTORICAL', 'FRESH')).toBe('HISTORICAL');
  });

  it('returns the fallback on an empty string', () => {
    expect(parseOpeningBalanceMode('', 'FRESH')).toBe('FRESH');
  });

  it('returns the fallback on a case-mismatched value', () => {
    expect(parseOpeningBalanceMode('fresh', 'FRESH')).toBe('FRESH');
  });
});
