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
 */

import { describe, it, expect } from 'vitest';
import { accountCreateSchema } from './account-create.schema';
import {
  AccountCurrency,
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
});
