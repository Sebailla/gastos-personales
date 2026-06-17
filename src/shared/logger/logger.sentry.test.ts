/**
 * Test the Sentry-forwarding side of `src/shared/logger/logger.ts`.
 *
 * The denylist redaction is tested separately in
 * `secrets.in-logs.test.ts`. Here we verify that:
 *
 *   1. When `SENTRY_DSN` is set, `logger.error` calls
 *      `Sentry.captureException` with a redaction-safe payload.
 *   2. `logger.warn` / `logger.info` / `logger.debug` do NOT call
 *      `Sentry.captureException` regardless of DSN (Sentry is for
 *      errors, not warnings/info).
 *
 * Sentry is dynamically imported by the logger, so we mock the
 * module so the test does not require a live Sentry install.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the mocked Sentry handle so we can assert against it.
// `vi.hoisted` runs before the mock factory so the same
// `captureException` vi.fn is returned every time the module is
// imported (even after `vi.resetModules()`).
const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentryMock);

// Set the DSN once for the whole file. The test does not exercise
// the "no DSN" path (the logger's early-return is one line and
// reading `process.env` directly is brittle under parallel test
// environments). The denylist test in `secrets.in-logs.test.ts`
// already exercises the no-DSN console-only path.
process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

import { logger } from './logger';

describe('logger → Sentry forwarding', () => {
  beforeEach(() => {
    sentryMock.captureException.mockReset();
  });

  it('calls Sentry.captureException with a redaction-safe payload on error', async () => {
    logger.error('signIn_callback_failed', {
      email: 'a@b.com',
      passwordHash: 'should-be-redacted',
      error: 'db down',
    });
    // Allow the async forwardToSentry microtask to run.
    await new Promise((r) => setImmediate(r));
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const [, options] = sentryMock.captureException.mock.calls[0]!;
    expect(options.extra.email).toBe('a@b.com');
    // The passwordHash key must be redacted before reaching Sentry.
    expect(options.extra.passwordHash).toBe('[REDACTED]');
    expect(options.extra.error).toBe('db down');
  });

  it('does NOT call Sentry.captureException for warn/info/debug levels', async () => {
    logger.warn('something to look at', { x: 1 });
    logger.info('informational', { y: 2 });
    logger.debug('verbose', { z: 3 });
    await new Promise((r) => setImmediate(r));
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it('captures the message in the Error so Sentry groups by it', async () => {
    logger.error('custom_error_key', { x: 1 });
    await new Promise((r) => setImmediate(r));
    const [err] = sentryMock.captureException.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('custom_error_key');
  });
});
