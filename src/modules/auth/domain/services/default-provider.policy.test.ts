import { describe, it, expect } from 'vitest';
import { stampDefaultProvider, inferProviderFromOAuthProfile } from './default-provider.policy';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

describe('DefaultProviderPolicy.stampDefaultProvider', () => {
  it('returns the new provider for a new user (first registration)', () => {
    expect(stampDefaultProvider(null, 'local')).toBe('local');
    expect(stampDefaultProvider(null, 'google')).toBe('google');
  });

  it('preserves the existing provider for an existing user (BR-AUTH-13)', () => {
    expect(stampDefaultProvider('local', 'google')).toBe('local');
    expect(stampDefaultProvider('google', 'local')).toBe('google');
  });
});

describe('DefaultProviderPolicy.inferProviderFromOAuthProfile', () => {
  it('returns "google" for a Google profile with email_verified: true', () => {
    expect(
      inferProviderFromOAuthProfile({ provider: 'google', email_verified: true }),
    ).toBe('google');
  });

  it('throws an AppError(INTERNAL_ERROR) for a non-Google provider', () => {
    expect(() =>
      inferProviderFromOAuthProfile({ provider: 'apple', email_verified: true }),
    ).toThrow(AppError);
  });

  it('throws an AppError for a Google profile with email_verified: false', () => {
    expect(() =>
      inferProviderFromOAuthProfile({ provider: 'google', email_verified: false }),
    ).toThrow(/email_verified/i);
  });
});
