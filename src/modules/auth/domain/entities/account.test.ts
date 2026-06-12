import { describe, it, expect } from 'vitest';
import { isAccount } from './account';

describe('isAccount', () => {
  it('accepts a row with the required fields', () => {
    expect(
      isAccount({
        id: 'a1',
        userId: 'u1',
        provider: 'google',
        providerAccountId: 'sub-123',
      }),
    ).toBe(true);
  });

  it('rejects a row missing a required field', () => {
    expect(isAccount({ id: 'a1', userId: 'u1', provider: 'google' })).toBe(false);
  });
});
