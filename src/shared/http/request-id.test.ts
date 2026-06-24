import { describe, it, expect } from 'vitest';
import { requestIdMiddleware } from './request-id';

const fakeContext = (headers: Record<string, string> = {}) =>
  ({
    req: {
      header: (name: string) => headers[name.toLowerCase()],
    },
    set: (key: string, value: unknown) => {
      // no-op
      void key;
      void value;
    },
    header: (name: string, value: string) => {
      void name;
      void value;
    },
  }) as unknown as Parameters<typeof requestIdMiddleware>[0];

describe('requestIdMiddleware', () => {
  it('echoes an incoming X-Request-Id header (F7)', async () => {
    // Capture both the c.set('requestId', ...) and
    // c.header('X-Request-Id', ...) calls so we can assert
    // the middleware actually echoes the client-supplied
    // id. The previous version of this test had
    // `expect(true).toBe(true)` and asserted nothing; this
    // version captures the calls and asserts on them.
    const captured: { set: string[]; header: Array<[string, string]> } = {
      set: [],
      header: [],
    };
    const c = fakeContext({ 'x-request-id': 'req-from-client' });
    (c as unknown as { set: (k: string, v: string) => void }).set = (k, v) => {
      if (k === 'requestId') captured.set.push(v);
    };
    (c as unknown as { header: (k: string, v: string) => void }).header = (k, v) => {
      captured.header.push([k, v]);
    };
    const next = async () => undefined;
    await requestIdMiddleware(c, next);
    // The middleware should have set the id to the
    // client-supplied value AND echoed it on the response
    // header.
    expect(captured.set).toEqual(['req-from-client']);
    expect(captured.header).toEqual([['X-Request-Id', 'req-from-client']]);
  });

  it('generates a fresh uuid v7 when the header is missing', async () => {
    const calls: string[] = [];
    const c = fakeContext();
    (c as unknown as { set: (k: string, v: string) => void }).set = (k, v) => {
      if (k === 'requestId') calls.push(v);
    };
    await requestIdMiddleware(c, async () => undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
