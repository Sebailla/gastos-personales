import { describe, it, expect } from 'vitest';
import {
  AccountType,
  AccountKind,
  InvestmentType,
  OpeningBalanceMode,
  AccountCurrency,
  AccountFxCasa,
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

describe('AccountFxCasa enum exhaustiveness', () => {
  // fx-cache PR-2 — REQ-FX-9: per-account casa selection. The
  // enum mirrors the Prisma `AccountFxCasa` (`prisma/schema.prisma`)
  // with UPPERCASE values per the project's existing 5 enums.
  // The DolarAPI wire format is lowercase; the lowercase ↔
  // uppercase mapping lives at the Zod / DTO layer (see
  // `src/modules/accounts/application/validation/account-fx-casa.schema.ts`
  // and the casa field in `toFinancialAccountDto`).
  it('declares exactly the 6 DolarAPI casas in uppercase', () => {
    expect(Object.values(AccountFxCasa).sort()).toEqual(
      ['BLUE', 'CCL', 'CRIPTO', 'MEP', 'OFICIAL', 'TARJETA'].sort(),
    );
  });
});

describe('FinancialAccount.casa field', () => {
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
    casa: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    updatedAt: new Date('2026-06-18T00:00:00.000Z'),
  };

  it('accepts a row with casa: "OFICIAL" (happy path)', () => {
    const rowWithCasa: FinancialAccount = { ...baseRow, casa: AccountFxCasa.OFICIAL };
    expect(rowWithCasa.casa).toBe(AccountFxCasa.OFICIAL);
    expect(isFinancialAccount(rowWithCasa)).toBe(true);
  });

  // TRIANGULATE — REQ-FX-9 migration safety: existing rows
  // land with casa: NULL. The shape MUST accept null (the
  // smoke UI renders the inherited global default).
  it('accepts a row with casa: null (existing row after the migration)', () => {
    const rowWithNullCasa: FinancialAccount = { ...baseRow, casa: null };
    expect(rowWithNullCasa.casa).toBeNull();
    expect(isFinancialAccount(rowWithNullCasa)).toBe(true);
  });

  // The migration is non-destructive: every existing row
  // ends up with casa = NULL; the user picks a casa on the
  // create form or via the future edit form.
  it('represents the three legal casa states: OFICIAL | BLUE | null', () => {
    const casaA: FinancialAccount = { ...baseRow, casa: AccountFxCasa.OFICIAL };
    const casaB: FinancialAccount = { ...baseRow, casa: AccountFxCasa.BLUE };
    const casaNull: FinancialAccount = { ...baseRow, casa: null };
    expect(casaA.casa).toBe('OFICIAL');
    expect(casaB.casa).toBe('BLUE');
    expect(casaNull.casa).toBeNull();
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
    casa: null,
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

  // F8: table-driven coverage for the 11 type-guard branches
  // in `isFinancialAccount`. The first arg is a label; the
  // second is a partial override that turns the base row
  // into a malformed one. Each branch has at least one
  // negative (null, undefined, wrong type, invalid enum
  // value, non-Date timestamps). Note: the guard checks
  // TYPES, not content — an empty string for `name` or
  // `userId` is still a string and is therefore accepted;
  // the per-type-field content validation is the Zod
  // schema's job (PR-B), not this guard.
  it.each([
    ['id is undefined', { id: undefined as unknown }],
    ['id is null', { id: null as unknown }],
    ['id is a number', { id: 42 as unknown }],
    ['userId is undefined', { userId: undefined as unknown }],
    ['userId is a number', { userId: 1 as unknown }],
    ['type is an invalid enum value', { type: 'BANKRUPTED' as unknown }],
    ['type is a number', { type: 1 as unknown }],
    ['name is undefined', { name: undefined as unknown }],
    ['name is a number', { name: 1 as unknown }],
    ['currency is an invalid enum value', { currency: 'GBP' as unknown }],
    ['currency is undefined', { currency: undefined as unknown }],
    ['openingBalanceMinor is a string', { openingBalanceMinor: '100' as unknown }],
    ['openingBalanceMinor is null', { openingBalanceMinor: null as unknown }],
    ['openingBalanceMode is an invalid enum value', { openingBalanceMode: 'YESTERDAY' as unknown }],
    ['openingBalanceMode is null', { openingBalanceMode: null as unknown }],
    ['openingBalanceDate is a string', { openingBalanceDate: '2026-06-18' as unknown }],
    ['openingBalanceDate is undefined (must be null or Date)', { openingBalanceDate: undefined as unknown }],
    ['archivedAt is a number', { archivedAt: 12345 as unknown }],
    ['createdAt is a string', { createdAt: '2026-06-18T00:00:00.000Z' as unknown }],
    ['createdAt is null (must be Date)', { createdAt: null as unknown }],
    ['updatedAt is undefined (must be Date)', { updatedAt: undefined as unknown }],
    ['updatedAt is a number', { updatedAt: 1719000000000 as unknown }],
  ])('rejects malformed row (%s)', (_label, override) => {
    const malformed = { ...baseRow, ...override };
    expect(isFinancialAccount(malformed)).toBe(false);
  });

  it('rejects null and non-objects outright', () => {
    expect(isFinancialAccount(null)).toBe(false);
    expect(isFinancialAccount(undefined)).toBe(false);
    expect(isFinancialAccount('not a row')).toBe(false);
    expect(isFinancialAccount(42)).toBe(false);
  });
});
