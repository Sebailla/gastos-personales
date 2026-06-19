import { describe, it, expect } from 'vitest';
import {
  AccountType,
  AccountKind,
  InvestmentType,
  OpeningBalanceMode,
  AccountCurrency,
  isFinancialAccount,
  type FinancialAccount,
} from './financial-account';

describe('AccountType enum exhaustiveness', () => {
  it('declares exactly the 6 values from the spec', () => {
    expect(Object.values(AccountType).sort()).toEqual(
      ['BANK', 'CASH', 'CREDIT', 'CRYPTO', 'INVESTMENT', 'OTHER'].sort(),
    );
  });
});

describe('AccountKind enum exhaustiveness', () => {
  it('declares exactly SAVINGS and CHECKING', () => {
    expect(Object.values(AccountKind).sort()).toEqual(['CHECKING', 'SAVINGS']);
  });
});

describe('InvestmentType enum exhaustiveness', () => {
  it('declares exactly the 5 values from the spec', () => {
    expect(Object.values(InvestmentType).sort()).toEqual(
      ['BONDS', 'CERTS_OF_DEPOSIT', 'MUTUAL_FUNDS', 'OTHER', 'STOCKS'].sort(),
    );
  });
});

describe('OpeningBalanceMode enum exhaustiveness', () => {
  it('declares exactly FRESH and HISTORICAL', () => {
    expect(Object.values(OpeningBalanceMode).sort()).toEqual(['FRESH', 'HISTORICAL']);
  });
});

describe('AccountCurrency enum exhaustiveness', () => {
  it('declares exactly the 3 whitelisted currencies', () => {
    expect(Object.values(AccountCurrency).sort()).toEqual(['ARS', 'EUR', 'USD']);
  });
});

describe('isFinancialAccount type-guard', () => {
  const baseRow: FinancialAccount = {
    id: 'fa-1',
    userId: 'u-1',
    type: AccountType.BANK,
    name: 'Main savings',
    currency: AccountCurrency.USD,
    openingBalanceMinor: 0,
    openingBalanceMode: OpeningBalanceMode.FRESH,
    openingBalanceDate: null,
    archivedAt: null,
    bankName: 'ICBC',
    accountKind: AccountKind.SAVINGS,
    issuer: null,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    broker: null,
    investmentType: null,
    walletAddress: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    updatedAt: new Date('2026-06-18T00:00:00.000Z'),
  };

  it('accepts a fully-shaped row (happy path)', () => {
    expect(isFinancialAccount(baseRow)).toBe(true);
  });

  it('rejects when archivedAt is a string instead of Date|null', () => {
    const malformed = {
      ...baseRow,
      archivedAt: '2026-06-18T00:00:00.000Z' as unknown,
    };
    expect(isFinancialAccount(malformed)).toBe(false);
  });
});
