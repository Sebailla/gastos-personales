import { describe, it, expect } from 'vitest';
import { hashArgon2id, verifyArgon2id, ARGON2ID_PARAMS } from './argon2.hasher';

describe('PasswordService (argon2.hasher)', () => {
  it('exports the chosen Argon2id parameters', () => {
    expect(ARGON2ID_PARAMS.memoryCost).toBe(19456);
    expect(ARGON2ID_PARAMS.timeCost).toBe(2);
    expect(ARGON2ID_PARAMS.parallelism).toBe(1);
  });

  it('hashArgon2id returns a string starting with $argon2id$', async () => {
    const hash = await hashArgon2id('a-good-password-1234');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifyArgon2id returns true for the correct password', async () => {
    const hash = await hashArgon2id('a-good-password-1234');
    expect(await verifyArgon2id(hash, 'a-good-password-1234')).toBe(true);
  });

  it('verifyArgon2id returns false for an incorrect password', async () => {
    const hash = await hashArgon2id('a-good-password-1234');
    expect(await verifyArgon2id(hash, 'a-different-password-9999')).toBe(false);
  });

  it('two consecutive hash calls produce different salts', async () => {
    const a = await hashArgon2id('a-good-password-1234');
    const b = await hashArgon2id('a-good-password-1234');
    expect(a).not.toBe(b);
  });
});
