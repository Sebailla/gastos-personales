import { describe, it, expect } from 'vitest';
import { uuidV7, sha256Hex, hmacSign, hmacVerify } from './web-crypto';

describe('web-crypto', () => {
  it('uuidV7 returns a 36-char string of the expected v7 shape', () => {
    const id = uuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(id).toHaveLength(36);
  });

  it('consecutive uuidV7 calls are monotonically non-decreasing in the timestamp prefix', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(uuidV7());
      // Tiny sleep to let the ms clock advance.
      await new Promise((r) => setTimeout(r, 2));
    }
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it('sha256Hex is deterministic and matches the Node-compatible hash', async () => {
    const a = await sha256Hex('hello');
    const b = await sha256Hex('hello');
    expect(a).toBe(b);
    // Known sha256 of "hello" = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(a).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('hmacSign and hmacVerify are symmetric', async () => {
    const key = 'shared-secret';
    const msg = 'message';
    const sig = await hmacSign(key, msg);
    const ok = await hmacVerify(key, msg, sig);
    expect(ok).toBe(true);
  });

  it('hmacVerify returns false for a tampered message', async () => {
    const key = 'shared-secret';
    const sig = await hmacSign(key, 'message');
    const ok = await hmacVerify(key, 'tampered', sig);
    expect(ok).toBe(false);
  });

  it('hmacVerify returns false for a wrong key', async () => {
    const sig = await hmacSign('key-a', 'message');
    const ok = await hmacVerify('key-b', 'message', sig);
    expect(ok).toBe(false);
  });
});
