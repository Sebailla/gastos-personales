/**
 * Tests for accountUpdateSchema.
 */

import { describe, it, expect } from 'vitest';
import { accountUpdateSchema } from './account-update.schema';
import {
  AccountCurrency,
  AccountType,
  OpeningBalanceMode,
} from '../../domain/entities/financial-account';

describe('accountUpdateSchema', () => {
  it('accepts a partial of BANK (name only)', () => {
    const result = accountUpdateSchema.safeParse({
      type: AccountType.BANK,
      name: 'Renamed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a body with wrong-type fields', () => {
    const result = accountUpdateSchema.safeParse({
      type: AccountType.BANK,
      name: 'X',
      issuer: 'Visa', // CREDIT-only field
    });
    expect(result.success).toBe(false);
  });

  it('rejects a body with negative openingBalanceMinor', () => {
    const result = accountUpdateSchema.safeParse({
      type: AccountType.BANK,
      openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: -100 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a body with empty name', () => {
    const result = accountUpdateSchema.safeParse({
      type: AccountType.BANK,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  // TRIANGULATE
  it('accepts updating the currency only', () => {
    const result = accountUpdateSchema.safeParse({
      type: AccountType.BANK,
      currency: AccountCurrency.EUR,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown type', () => {
    const result = accountUpdateSchema.safeParse({
      type: 'GOLD',
      name: 'X',
    });
    expect(result.success).toBe(false);
  });
});
