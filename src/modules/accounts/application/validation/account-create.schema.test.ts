/**
 * Tests for accountCreateSchema.
 *
 * 8 cases covering:
 * (1) valid BANK with FRESH passes
 * (2) valid BANK with HISTORICAL + date passes
 * (3) BANK with `issuer` (CREDIT field) fails
 * (4) CREDIT with `bankName` (BANK field) fails
 * (5) HISTORICAL without `date` fails
 * (6) FRESH with non-null `date` fails
 * (7) negative `openingBalanceMinor` fails
 * (8) missing `name` fails
 *
 * 5 fx-cache PR-2 T2.4 casa cases appended at the bottom:
 * (9) valid UPPERCASE casa parses
 * (10) invalid casa (lowercase wire form mixed-case) fails — the
 *      schema is the Prisma-boundary form (UPPERCASE), so the
 *      lowercase DolarAPI form is rejected here. The action
 *      layer normalises if needed (PR-3 will do this from the
 *      env var; the API surface today only accepts UPPERCASE).
 * (11) casa: undefined parses (treated as `column = NULL`)
 * (12) casa: null parses (treated as `column = NULL`)
 * (13) the schema's output type narrows correctly
 */

import { describe, it, expect } from 'vitest';
import { accountCreateSchema } from './account-create.schema';
import {
  AccountCurrency,
  AccountFxCasa,
  AccountKind,
  AccountType,
  InvestmentType,
  OpeningBalanceMode,
} from '../../domain/entities/financial-account';

const bankFresh = {
  type: AccountType.BANK,
  name: 'Main savings',
  currency: AccountCurrency.USD,
  openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: 0 },
  bankName: 'ICBC',
  accountKind: AccountKind.SAVINGS,
};

const bankHistorical = {
  ...bankFresh,
  openingBalance: {
    mode: OpeningBalanceMode.HISTORICAL,
    amountMinor: 50000,
    date: '2026-01-01T00:00:00.000Z',
  },
};

describe('accountCreateSchema', () => {
  it('accepts a valid BANK with FRESH opening balance', () => {
    const result = accountCreateSchema.safeParse(bankFresh);
    expect(result.success).toBe(true);
  });

  it('accepts a valid BANK with HISTORICAL opening balance + date', () => {
    const result = accountCreateSchema.safeParse(bankHistorical);
    expect(result.success).toBe(true);
  });

  it('rejects BANK with `issuer` (CREDIT-only field)', () => {
    const result = accountCreateSchema.safeParse({
      ...bankFresh,
      issuer: 'Visa',
    });
    expect(result.success).toBe(false);
  });

  it('rejects CREDIT with `bankName` (BANK-only field)', () => {
    const result = accountCreateSchema.safeParse({
      type: AccountType.CREDIT,
      name: 'My card',
      currency: AccountCurrency.USD,
      openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: 0 },
      issuer: 'Visa',
      statementDay: 5,
      paymentDueDay: 15,
      bankName: 'ICBC', // wrong-type field
    });
    expect(result.success).toBe(false);
  });

  it('rejects HISTORICAL without `date`', () => {
    const result = accountCreateSchema.safeParse({
      ...bankFresh,
      openingBalance: { mode: OpeningBalanceMode.HISTORICAL, amountMinor: 50000 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects FRESH with non-null `date`', () => {
    const result = accountCreateSchema.safeParse({
      ...bankFresh,
      openingBalance: {
        mode: OpeningBalanceMode.FRESH,
        amountMinor: 0,
        date: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative openingBalanceMinor', () => {
    const result = accountCreateSchema.safeParse({
      ...bankFresh,
      openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: -100 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing `name`', () => {
    const { name: _name, ...rest } = bankFresh;
    const result = accountCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // TRIANGULATE: additional cases
  it('accepts an INVESTMENT with STOCKS', () => {
    const result = accountCreateSchema.safeParse({
      type: AccountType.INVESTMENT,
      name: 'Balanz Stocks',
      currency: AccountCurrency.USD,
      openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: 0 },
      broker: 'Balanz',
      investmentType: InvestmentType.STOCKS,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a CRYPTO without walletAddress (optional)', () => {
    const result = accountCreateSchema.safeParse({
      type: AccountType.CRYPTO,
      name: 'BTC',
      currency: AccountCurrency.USD,
      openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: 0 },
    });
    expect(result.success).toBe(true);
  });

  // -- fx-cache PR-2 T2.4 — REQ-FX-9 casa field --
  // The schema accepts the UPPERCASE Prisma-boundary form (matching
  // `AccountFxCasa`); the lowercase DolarAPI wire form is rejected
  // here (it lives at the `fx-casa-string.schema.ts` boundary and
  // would only reach this schema via a future normalisation in the
  // action layer).
  it('accepts casa: "OFICIAL" (UPPERCASE Prisma form)', () => {
    const result = accountCreateSchema.safeParse({
      ...bankFresh,
      casa: AccountFxCasa.OFICIAL,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data['casa']).toBe(AccountFxCasa.OFICIAL);
    }
  });

  it('rejects casa: "oficial" (lowercase DolarAPI wire form on the Prisma boundary)', () => {
    const result = accountCreateSchema.safeParse({
      ...bankFresh,
      casa: 'oficial',
    });
    expect(result.success).toBe(false);
  });

  it('accepts casa: undefined (treated as column = NULL; inherit global default)', () => {
    const result = accountCreateSchema.safeParse(bankFresh);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data['casa']).toBeUndefined();
    }
  });

  it('accepts casa: null (explicitly NULL; same effect as undefined)', () => {
    const result = accountCreateSchema.safeParse({
      ...bankFresh,
      casa: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data['casa']).toBeNull();
    }
  });

  // TRIANGULATE — type-level guarantee: the output narrows on the
  // union (`casa?: AccountFxCasa | null`). A typo at the consumer
  // (e.g. `parsed.casa.toLowerCase()` when casa is `null`) is a
  // compile error.
  it('narrows casa on the parsed output: undefined | null | AccountFxCasa', () => {
    const result = accountCreateSchema.safeParse({ ...bankFresh, casa: AccountFxCasa.BLUE });
    expect(result.success).toBe(true);
    if (result.success) {
      const casa: AccountFxCasa | null | undefined = result.data['casa'];
      expect(casa).toBe(AccountFxCasa.BLUE);
    }
  });
});
