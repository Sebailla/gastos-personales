import { describe, it, expect, expectTypeOf } from 'vitest';
import { ErrorCode, ErrorStatus } from './error-codes';

/**
 * RED: error-codes — 3 new transactions codes (3 cases).
 *
 * Slice 2 binding. The transactions capability introduces three
 * new codes that join the existing enum at
 * `src/shared/errors/error-codes.ts:12-43`:
 *
 * - `INVALID_AMOUNT` (400) — `amountMinor <= 0`.
 * - `FUTURE_DATE_NOT_ALLOWED` (400) — `transactionDate > Clock.now()`.
 * - `ACCOUNT_ARCHIVED` (409) — write against an archived account.
 *
 * Branches:
 *  1. Each new code is exposed on the `ErrorCode` const with the
 *     documented string value (the wire enum contract).
 *  2. `ErrorStatus` maps each new code to the right HTTP status.
 *  3. Exhaustive type check — every key in `ErrorCode` is also a
 *     key in `ErrorStatus` (the compile-time invariant every
 *     future code addition must preserve).
 */

describe('error-codes — slice 2 transactions codes', () => {
  it('declares the three new transactions codes with their wire strings', () => {
    expect(ErrorCode.INVALID_AMOUNT).toBe('INVALID_AMOUNT');
    expect(ErrorCode.FUTURE_DATE_NOT_ALLOWED).toBe('FUTURE_DATE_NOT_ALLOWED');
    expect(ErrorCode.ACCOUNT_ARCHIVED).toBe('ACCOUNT_ARCHIVED');
  });

  it('ErrorStatus maps the three new codes to the right HTTP statuses', () => {
    // REQ-TX-2: INVALID_AMOUNT is a validation error → 400.
    expect(ErrorStatus.INVALID_AMOUNT).toBe(400);
    // REQ-TX-4: FUTURE_DATE_NOT_ALLOWED is a validation error → 400.
    expect(ErrorStatus.FUTURE_DATE_NOT_ALLOWED).toBe(400);
    // REQ-TX-7: ACCOUNT_ARCHIVED is a write conflict → 409.
    expect(ErrorStatus.ACCOUNT_ARCHIVED).toBe(409);
  });

  it('ErrorStatus is exhaustive over the ErrorCode union (compile-time invariant)', () => {
    // Any key in ErrorCode MUST also be a key in ErrorStatus.
    // If a future code is added to the const without the matching
    // status entry, this assertion fails at compile time. No
    // runtime loop needed (AGENTS.md §10.5: "No logic in tests").
    expectTypeOf<keyof typeof ErrorStatus>().toEqualTypeOf<keyof typeof ErrorCode>();
  });
});
