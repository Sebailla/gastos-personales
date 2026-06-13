import { describe, it, expect } from 'vitest';
import { healthSuccessSchema } from './health.dto';

describe('healthSuccessSchema', () => {
  it('accepts a healthy response shape', () => {
    const parsed = healthSuccessSchema.safeParse({
      status: 'ok',
      version: '0.1.0',
      uptime: 12.34,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a non-ok status', () => {
    const parsed = healthSuccessSchema.safeParse({
      status: 'degraded',
      version: '0.1.0',
      uptime: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
