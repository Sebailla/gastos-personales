// @vitest-environment jsdom
/** T-UI-027: mapApiErrorToFieldError — maps ErrorEnvelope codes to per-field errors. */

import { describe, it, expect } from 'vitest';
import { mapApiErrorToFieldError } from './map-api-error';

describe('mapApiErrorToFieldError', () => {
  it('maps INVALID_AMOUNT to amountMinor field', () => {
    const result = mapApiErrorToFieldError(
      { error: { code: 'INVALID_AMOUNT', message: 'Amount must be > 0' } },
      ['amountMinor', 'accountId'],
    );
    expect(result.amountMinor).toBe('Amount must be > 0');
  });

  it('maps FUTURE_DATE_NOT_ALLOWED to transactionDate field', () => {
    const result = mapApiErrorToFieldError(
      { error: { code: 'FUTURE_DATE_NOT_ALLOWED', message: 'Date cannot be in the future' } },
      ['transactionDate'],
    );
    expect(result.transactionDate).toBe('Date cannot be in the future');
  });

  it('maps ACCOUNT_ARCHIVED to accountId field', () => {
    const result = mapApiErrorToFieldError(
      { error: { code: 'ACCOUNT_ARCHIVED', message: 'Account is archived' } },
      ['accountId'],
    );
    expect(result.accountId).toBe('Account is archived');
  });

  it('falls back to the first field for unknown codes', () => {
    const result = mapApiErrorToFieldError(
      { error: { code: 'UNKNOWN_CODE', message: 'Something went wrong' } },
      ['accountId', 'amountMinor'],
    );
    expect(result.accountId).toBe('Something went wrong');
  });
});