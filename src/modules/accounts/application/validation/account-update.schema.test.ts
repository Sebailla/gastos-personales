/**
 * Tests for accountUpdateSchema.
 *
 * fx-cache PR-2 T2.5 — REQ-FX-9. The update schema accepts the
 * partial casa field (UPPERCASE Prisma form). Two cases:
 * (1) partial with casa: 'BLUE' parses;
 * (2) casa: 'INVALID' fails.
 */

import { describe, it, expect } from 'vitest';
import { accountUpdateSchema } from './account-update.schema';
import {
  AccountCurrency,
  AccountFxCasa,
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

  // -- fx-cache PR-2 T2.5 — REQ-FX-9 casa partial --
  it('accepts a partial update with casa: BLUE (UPPERCASE Prisma form)', () => {
    const result = accountUpdateSchema.safeParse({
      type: AccountType.BANK,
      casa: AccountFxCasa.BLUE,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data['casa']).toBe(AccountFxCasa.BLUE);
    }
  });

  it('rejects casa: "INVALID" (not one of the 6 AccountFxCasa values)', () => {
    const result = accountUpdateSchema.safeParse({
      type: AccountType.BANK,
      casa: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});
