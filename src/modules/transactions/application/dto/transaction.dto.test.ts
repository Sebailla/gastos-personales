/**
 * Tests for TransactionDTO mapper.
 *
 * RED — 3 cases covering:
 * (1) DTO shape matches the entity fields (mirror)
 * (2) mapper returns null fxAsOfSnapshot when null
 * (3) mapper returns ISO date string for occurredAt (and all
 *     Date fields)
 *
 * Slice 3 binding. The DTO mirrors the public output shape
 * the API/UI consumer reads. Date fields are ISO 8601 strings;
 * the casa snapshot is the lowercase DolarAPI wire form (the
 * `fx` capability consumes it). Per the design §4.2, the
 * mapper carries no business logic — pure shape conversion.
 */

import { describe, it, expect } from 'vitest';
import { toTransactionDto } from './transaction.dto';
import {
  AccountCurrency,
  AccountFxCasa,
  TransactionDirection,
  type Transaction,
} from '../../domain/entities/transaction';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  const now = new Date('2026-06-23T10:00:00.000Z');
  const earlier = new Date('2026-06-23T08:00:00.000Z');
  const base: Omit<Transaction, 'equals' | 'withUpdates'> = {
    id: 'tx-1',
    userId: 'u-1',
    accountId: 'fa-1',
    direction: TransactionDirection.EXPENSE,
    amountMinor: 1000,
    currency: AccountCurrency.USD,
    memo: 'coffee',
    category: null,
    transactionDate: earlier,
    convertedAmountMinor: 1100000,
    convertedCurrency: AccountCurrency.ARS,
    fxAsOfSnapshot: now,
    casaSnapshot: AccountFxCasa.OFICIAL,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...base,
    ...overrides,
    equals: () => true,
    withUpdates: () => makeTx(overrides),
  } as Transaction;
}

describe('TransactionDTO mapper', () => {
  it('DTO shape mirrors the entity fields', () => {
    const dto = toTransactionDto(makeTx());
    expect(dto.id).toBe('tx-1');
    expect(dto.userId).toBe('u-1');
    expect(dto.accountId).toBe('fa-1');
    expect(dto.direction).toBe(TransactionDirection.EXPENSE);
    expect(dto.amountMinor).toBe(1000);
    expect(dto.currency).toBe(AccountCurrency.USD);
    expect(dto.memo).toBe('coffee');
    expect(dto.category).toBeNull();
    expect(dto.convertedAmountMinor).toBe(1100000);
    expect(dto.convertedCurrency).toBe(AccountCurrency.ARS);
  });

  it('returns null fxAsOfSnapshot when the entity has null (no FX call)', () => {
    const dto = toTransactionDto(
      makeTx({
        fxAsOfSnapshot: null,
        casaSnapshot: null,
      }),
    );
    expect(dto.fxAsOfSnapshot).toBeNull();
    expect(dto.casaSnapshot).toBeNull();
  });

  it('serializes Date fields as ISO 8601 strings', () => {
    const isoStr = '2026-06-23T08:00:00.000Z';
    const dto = toTransactionDto(
      makeTx({
        transactionDate: new Date(isoStr),
      }),
    );
    expect(dto.transactionDate).toBe(isoStr);
    expect(typeof dto.transactionDate).toBe('string');
  });
});
