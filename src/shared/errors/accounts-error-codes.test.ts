import { describe, it, expect } from 'vitest';
import { ErrorCode, ErrorStatus } from './error-codes';

/**
 * Tests the 3 error codes added for the accounts-ledger change.
 *
 * Note: NOT_FOUND, NAME_TAKEN, and FX_UNAVAILABLE were added in
 * T-A6 (not T-A7 as originally scoped) because the AccountService
 * skeleton references `ErrorCode.NOT_FOUND` and the getBalance
 * propagation test references `FX_UNAVAILABLE`. The code must
 * exist by the end of T-A6. T-A7 is reduced to verifying the
 * registry is complete and the status mappings are correct.
 *
 * The 4th code (`FX_NOT_SUPPORTED`) lands in PR-B (T-B8).
 */

describe('accounts-ledger error codes (T-A7 verification)', () => {
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
});
