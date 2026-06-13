import { describe, it, expect } from 'vitest';
import { registerInputSchema, type RegisterInput } from './register.dto';

const validInput: RegisterInput = {
  email: 'a@b.com',
  password: 'a-strong-password-1234',
};

describe('registerInputSchema', () => {
  it('accepts a well-formed email and a password >= 10 chars', () => {
    const parsed = registerInputSchema.safeParse(validInput);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // The schema normalizes email to lowercase and trims whitespace.
      expect(parsed.data.email).toBe('a@b.com');
      expect(parsed.data.password).toBe('a-strong-password-1234');
    }
  });

  it('rejects an empty email with VALIDATION_ERROR', () => {
    const parsed = registerInputSchema.safeParse({ ...validInput, email: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      expect(firstIssue?.path[0]).toBe('email');
    }
  });

  it('rejects a malformed email with VALIDATION_ERROR', () => {
    const parsed = registerInputSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      expect(firstIssue?.path[0]).toBe('email');
    }
  });

  it('rejects a password shorter than 10 characters with WEAK_PASSWORD (BR-AUTH-2)', () => {
    const parsed = registerInputSchema.safeParse({ ...validInput, password: 'short' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      expect(firstIssue?.path[0]).toBe('password');
      // The error message is the BR-AUTH-2 hint in Spanish.
      expect(firstIssue?.message).toMatch(/10/);
    }
  });

  it('normalizes email to lowercase and trims surrounding whitespace', () => {
    const parsed = registerInputSchema.safeParse({
      email: '  A@B.COM  ',
      password: 'a-strong-password-1234',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('a@b.com');
    }
  });
});
