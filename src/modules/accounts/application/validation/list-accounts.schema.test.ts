/**
 * Tests for listAccountsSchema and accountBalanceSchema.
 */

import { describe, it, expect } from 'vitest';
import { listAccountsSchema } from './list-accounts.schema';
import { accountBalanceSchema } from './account-balance.schema';
import { AccountCurrency } from '../../domain/entities/financial-account';

describe('listAccountsSchema', () => {
  it('accepts an empty query (defaults applied)', () => {
    const result = listAccountsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('accepts limit=20 (default)', () => {
    const result = listAccountsSchema.safeParse({ limit: '20' });
    expect(result.success).toBe(true);
  });

  it('accepts limit=100 (max)', () => {
    const result = listAccountsSchema.safeParse({ limit: '100' });
    expect(result.success).toBe(true);
  });

  it('rejects limit=101', () => {
    const result = listAccountsSchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('rejects limit=0', () => {
    const result = listAccountsSchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('accepts cursor + limit + archivedAt=null', () => {
    const result = listAccountsSchema.safeParse({
      cursor: 'opaque',
      limit: '50',
      archivedAt: 'null',
    });
    expect(result.success).toBe(true);
  });

  it('rejects the legacy archivedAt values (N2 trim to "null" only)', () => {
    // The Zod enum was trimmed to `['null']` because the
    // repository only handles that case. The legacy `live`
    // and `archived` values were a maintenance trap; the
    // schema must now reject them explicitly.
    expect(listAccountsSchema.safeParse({ archivedAt: 'live' }).success).toBe(false);
    expect(listAccountsSchema.safeParse({ archivedAt: 'archived' }).success).toBe(false);
  });

  it('rejects unknown query keys', () => {
    const result = listAccountsSchema.safeParse({ evil: '1' });
    expect(result.success).toBe(false);
  });
});

describe('accountBalanceSchema', () => {
  it('accepts displayCurrency=ARS', () => {
    const result = accountBalanceSchema.safeParse({ displayCurrency: AccountCurrency.ARS });
    expect(result.success).toBe(true);
  });

  it('accepts displayCurrency=USD', () => {
    const result = accountBalanceSchema.safeParse({ displayCurrency: AccountCurrency.USD });
    expect(result.success).toBe(true);
  });

  it('accepts displayCurrency=EUR', () => {
    const result = accountBalanceSchema.safeParse({ displayCurrency: AccountCurrency.EUR });
    expect(result.success).toBe(true);
  });

  it('rejects displayCurrency=GBP (not whitelisted)', () => {
    const result = accountBalanceSchema.safeParse({ displayCurrency: 'GBP' });
    expect(result.success).toBe(false);
  });

  it('rejects missing displayCurrency', () => {
    const result = accountBalanceSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
