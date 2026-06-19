import { describe, it, expect } from 'vitest';
import { ErrorCode, ErrorStatus } from './error-codes';

/**
 * Tests the 4 error codes added for the accounts-ledger change.
 *
 * Note: NOT_FOUND, NAME_TAKEN, and FX_UNAVAILABLE were added in
 * T-A6 (not T-A7 as originally scoped) because the AccountService
 * skeleton references `ErrorCode.NOT_FOUND` and the getBalance
 * propagation test references `FX_UNAVAILABLE`. The code must
 * exist by the end of T-A6. T-A7 is reduced to verifying the
 * registry is complete and the status mappings are correct.
 *
 * FX_NOT_SUPPORTED was added in T-B2 (not T-B8 as originally
 * scoped) because the FxRateProviderStub test references it.
 * T-B8 is reduced to verifying the 4th mapping is correct.
 */

describe('accounts-ledger error codes (T-A7 + T-B8 verification)', () => {
  it('declares NAME_TAKEN with HTTP 409', () => {
    expect(ErrorCode.NAME_TAKEN).toBe('NAME_TAKEN');
    expect(ErrorStatus.NAME_TAKEN).toBe(409);
  });

  it('declares NOT_FOUND with HTTP 404', () => {
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorStatus.NOT_FOUND).toBe(404);
  });

  it('declares FX_UNAVAILABLE with HTTP 503', () => {
    expect(ErrorCode.FX_UNAVAILABLE).toBe('FX_UNAVAILABLE');
    expect(ErrorStatus.FX_UNAVAILABLE).toBe(503);
  });

  it('declares FX_NOT_SUPPORTED with HTTP 409', () => {
    expect(ErrorCode.FX_NOT_SUPPORTED).toBe('FX_NOT_SUPPORTED');
    expect(ErrorStatus.FX_NOT_SUPPORTED).toBe(409);
  });
});
