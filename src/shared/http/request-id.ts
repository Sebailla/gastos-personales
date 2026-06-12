import type { MiddlewareHandler } from 'hono';
import { uuidV7 } from '@/shared/crypto/web-crypto';

/**
 * Hono middleware: ensure every request has a `requestId`
 * available on the context and on the response. If the caller
 * supplies `X-Request-Id`, we echo it (truncated to 128 chars);
 * otherwise we generate a fresh uuid v7.
 *
 * Mounted once at the top of the Hono app in Slice B.
 */
export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header('x-request-id');
  const requestId = incoming && incoming.length <= 128 ? incoming : uuidV7();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
};
