/**
 * Tests for the response DTOs.
 *
 * 3 cases:
 * (1) toFinancialAccountDto converts a domain row to the wire shape.
 * (2) toBalanceDto converts an FxConversionResult to the wire shape.
 * (3) toBalanceDto omits `warnings` when undefined.
 */

import { describe, it, expect } from 'vitest';
import { toFinancialAccountDto } from './financial-account.dto';
import { toBalanceDto } from './financial-account-balance.dto';
import {
  AccountCurrency,
  AccountKind,
  AccountType,
  OpeningBalanceMode,
  type FinancialAccount,
} from '../../domain/entities/financial-account';
import type { FxConversionResult } from '../../domain/interfaces/fx-rate-provider.port';

function makeRow(): FinancialAccount {
  return {
    id: 'fa-1',
    userId: 'u-1',
    type: AccountType.BANK,
    name: 'Main',
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
}

describe('toFinancialAccountDto', () => {
  it('converts a domain row to the wire shape with ISO 8601 dates', () => {
    const dto = toFinancialAccountDto(makeRow());
    expect(dto.id).toBe('fa-1');
    expect(dto.type).toBe('BANK');
    expect(dto.bankName).toBe('ICBC');
    expect(dto.createdAt).toBe('2026-06-18T00:00:00.000Z');
    expect(dto.openingBalanceDate).toBeNull();
  });
});

describe('toBalanceDto', () => {
  it('converts an FxConversionResult to the wire shape', () => {
    const result: FxConversionResult = {
      native: { amount: 100000, currency: AccountCurrency.USD },
      display: {
        amount: 92000,
        currency: AccountCurrency.EUR,
        fxRate: 0.92,
        fxAsOf: new Date('2026-06-18T20:00:00.000Z'),
      },
      warnings: ['rate is older than 24h'],
    };
    const dto = toBalanceDto(result);
    expect(dto.display.amount).toBe(92000);
    expect(dto.display.fxAsOf).toBe('2026-06-18T20:00:00.000Z');
    expect(dto.warnings).toEqual(['rate is older than 24h']);
  });

  it('omits `warnings` when undefined', () => {
    const result: FxConversionResult = {
      native: { amount: 100000, currency: AccountCurrency.USD },
      display: {
        amount: 100000,
        currency: AccountCurrency.USD,
        fxRate: 1,
        fxAsOf: new Date('2026-06-18T20:00:00.000Z'),
      },
    };
    const dto = toBalanceDto(result);
    expect(dto.warnings).toBeUndefined();
    expect('warnings' in dto).toBe(false);
  });
});
