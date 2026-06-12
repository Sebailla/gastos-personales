import { describe, it, expect } from 'vitest';
import { isSessionActive, SESSION_TTL_MS } from './session';

describe('session', () => {
  it('S1 expires 30 days from creation (BR-AUTH-7)', () => {
    const created = new Date('2026-06-12T00:00:00Z');
    const expectedExpiry = new Date(created.getTime() + SESSION_TTL_MS);
    expect(new Date('2026-07-12T00:00:00Z').getTime()).toBe(expectedExpiry.getTime());
  });

  it('isSessionActive returns true for a session that has not expired', () => {
    const now = new Date('2026-06-12T12:00:00Z');
    const expires = new Date('2026-07-12T00:00:00Z');
    expect(isSessionActive(expires, now)).toBe(true);
  });

  it('isSessionActive returns false for an expired session', () => {
    const now = new Date('2026-08-01T00:00:00Z');
    const expires = new Date('2026-07-12T00:00:00Z');
    expect(isSessionActive(expires, now)).toBe(false);
  });
});
