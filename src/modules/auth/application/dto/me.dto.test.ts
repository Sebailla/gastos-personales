import { describe, it, expect } from 'vitest';
import { meSuccessSchema } from './me.dto';

describe('meSuccessSchema', () => {
  it('accepts a well-formed PublicUser projection', () => {
    const projection = {
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      image: null,
      defaultProvider: 'local' as const,
      lastLoginAt: '2026-06-12T10:00:00.000Z',
    };
    const parsed = meSuccessSchema.safeParse(projection);
    expect(parsed.success).toBe(true);
  });

  it('accepts a projection with null name, image, and lastLoginAt', () => {
    const projection = {
      id: 'u1',
      email: 'a@b.com',
      name: null,
      image: null,
      defaultProvider: 'google' as const,
      lastLoginAt: null,
    };
    const parsed = meSuccessSchema.safeParse(projection);
    expect(parsed.success).toBe(true);
  });

  it('rejects a projection with the wrong defaultProvider enum', () => {
    const projection = {
      id: 'u1',
      email: 'a@b.com',
      name: null,
      image: null,
      defaultProvider: 'facebook',
      lastLoginAt: null,
    };
    const parsed = meSuccessSchema.safeParse(projection);
    expect(parsed.success).toBe(false);
  });
});
