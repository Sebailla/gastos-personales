/**
 * test/sync-obsidian.test.ts
 *
 * Unit tests for the script's pure helpers. Behavioral coverage for
 * classifyError and the exit-code contract; these are the pieces with
 * branching logic worth pinning down. The I/O-heavy main() is exercised
 * end-to-end by the post-commit hook, not here.
 */

import { describe, expect, it } from 'vitest';
import {
  EXIT_OK,
  EXIT_SOURCE_MISSING,
  EXIT_UNEXPECTED,
  EXIT_VAULT_PARENT_MISSING,
  EXIT_VERIFICATION_MISMATCH,
  classifyError,
} from '../scripts/sync-obsidian';

describe('exit codes (contract)', () => {
  it('EXIT_OK is 0', () => {
    expect(EXIT_OK).toBe(0);
  });

  it('EXIT_UNEXPECTED is 1', () => {
    expect(EXIT_UNEXPECTED).toBe(1);
  });

  it('EXIT_SOURCE_MISSING is 2', () => {
    expect(EXIT_SOURCE_MISSING).toBe(2);
  });

  it('EXIT_VAULT_PARENT_MISSING is 3', () => {
    expect(EXIT_VAULT_PARENT_MISSING).toBe(3);
  });

  it('EXIT_VERIFICATION_MISMATCH is 4', () => {
    expect(EXIT_VERIFICATION_MISMATCH).toBe(4);
  });

  it('exit codes are unique', () => {
    const codes = [
      EXIT_OK,
      EXIT_UNEXPECTED,
      EXIT_SOURCE_MISSING,
      EXIT_VAULT_PARENT_MISSING,
      EXIT_VERIFICATION_MISMATCH,
    ];
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('classifyError — known fs errors', () => {
  it('maps ENOENT to EXIT_VAULT_PARENT_MISSING with the offending path', () => {
    const err = Object.assign(new Error('no such file'), {
      code: 'ENOENT',
      path: '/some/missing/path',
    });
    const result = classifyError(err);

    expect(result.code).toBe(EXIT_VAULT_PARENT_MISSING);
    expect(result.message).toContain('ENOENT');
    expect(result.message).toContain('/some/missing/path');
  });

  it('maps ENOENT without a path attribute to a still-classified message', () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const result = classifyError(err);

    expect(result.code).toBe(EXIT_VAULT_PARENT_MISSING);
    expect(result.message).toContain('ENOENT');
    expect(result.message).toContain('unknown path');
  });

  it('maps ERR_FS_CP_DIR_TO_NON_DIR to EXIT_UNEXPECTED', () => {
    const err = Object.assign(new Error('cannot overwrite'), {
      code: 'ERR_FS_CP_DIR_TO_NON_DIR',
    });
    const result = classifyError(err);

    expect(result.code).toBe(EXIT_UNEXPECTED);
    expect(result.message).toContain('ERR_FS_CP_DIR_TO_NON_DIR');
  });

  it('maps ERR_FS_CP_EEXIST to EXIT_UNEXPECTED', () => {
    const err = Object.assign(new Error('target exists'), {
      code: 'ERR_FS_CP_EEXIST',
    });
    const result = classifyError(err);

    expect(result.code).toBe(EXIT_UNEXPECTED);
    expect(result.message).toContain('ERR_FS_CP_EEXIST');
  });
});

describe('classifyError — verification errors', () => {
  it('maps a VerificationError to EXIT_VERIFICATION_MISMATCH', () => {
    const err = new Error('count mismatch: source=5 target=4');
    err.name = 'VerificationError';
    const result = classifyError(err);

    expect(result.code).toBe(EXIT_VERIFICATION_MISMATCH);
    expect(result.message).toBe('count mismatch: source=5 target=4');
  });
});

describe('classifyError — unclassified inputs fall back to EXIT_UNEXPECTED', () => {
  it('handles a plain Error with no .code', () => {
    const result = classifyError(new Error('boom'));

    expect(result.code).toBe(EXIT_UNEXPECTED);
    expect(result.message).toContain('boom');
  });

  it('handles a string thrown value', () => {
    const result = classifyError('something went wrong');

    expect(result.code).toBe(EXIT_UNEXPECTED);
    expect(result.message).toContain('something went wrong');
  });

  it('handles null', () => {
    const result = classifyError(null);

    expect(result.code).toBe(EXIT_UNEXPECTED);
    expect(result.message).toContain('unexpected failure');
  });

  it('handles undefined', () => {
    const result = classifyError(undefined);

    expect(result.code).toBe(EXIT_UNEXPECTED);
    expect(result.message).toContain('unexpected failure');
  });

  it('handles a number thrown value', () => {
    const result = classifyError(42);

    expect(result.code).toBe(EXIT_UNEXPECTED);
    expect(result.message).toContain('42');
  });
});
