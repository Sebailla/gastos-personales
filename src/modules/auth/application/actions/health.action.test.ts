import { describe, it, expect } from 'vitest';
import { healthAction } from './health.action';

describe('healthAction', () => {
  it('returns 200 with status, version, and uptime', async () => {
    const res = await healthAction();
    expect(res.status).toBe(200);
    if (res.status === 200) {
      expect(res.data.status).toBe('ok');
      expect(typeof res.data.version).toBe('string');
      expect(res.data.version.length).toBeGreaterThan(0);
      expect(typeof res.data.uptime).toBe('number');
      expect(res.data.uptime).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports an uptime that is monotonically non-decreasing across two calls', async () => {
    const a = await healthAction();
    // Small delay to make uptime() grow.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const b = await healthAction();
    if (a.status === 200 && b.status === 200) {
      expect(b.data.uptime).toBeGreaterThanOrEqual(a.data.uptime);
    }
  });
});
