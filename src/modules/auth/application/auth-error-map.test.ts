import { describe, it, expect } from 'vitest';
import { mapAuthErrorToMessage } from './auth-error-map';

describe('mapAuthErrorToMessage', () => {
  it('returns a clear Spanish message for OAuthAccountNotLinked (decision gap #6)', () => {
    const msg = mapAuthErrorToMessage('OAuthAccountNotLinked');
    expect(msg).toMatch(/Google/);
    expect(msg.length).toBeGreaterThan(20);
  });

  it('returns a clear Spanish message for AccessDenied', () => {
    const msg = mapAuthErrorToMessage('AccessDenied');
    expect(msg.length).toBeGreaterThan(10);
  });

  it('returns a clear Spanish message for Verification', () => {
    const msg = mapAuthErrorToMessage('Verification');
    expect(msg.length).toBeGreaterThan(10);
  });

  it('returns a generic message for unknown error codes (no info leak)', () => {
    const msg = mapAuthErrorToMessage('SomeWeirdCode');
    // The generic message should NOT echo the unknown code.
    expect(msg).not.toContain('SomeWeirdCode');
    expect(msg.length).toBeGreaterThan(10);
  });

  it('returns a non-empty message for the empty-string input', () => {
    const msg = mapAuthErrorToMessage('');
    expect(msg.length).toBeGreaterThan(0);
  });
});
