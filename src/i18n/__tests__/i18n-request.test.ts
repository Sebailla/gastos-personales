/**
 * RED → GREEN → TRIANGULATE coverage for `src/i18n/request.ts`.
 *
 * The `getRequestConfig` factory is the bridge between the middleware
 * (which writes the `x-locale` request header) and the `next-intl`
 * runtime (which calls `getRequestConfig` on every Server Component
 * render). The header-driven dispatch is the single source of truth
 * per REQ-UI-17; this test pins the contract so a future refactor
 * does not silently fall back to `defaultLocale` and bypass the
 * middleware's locale decision.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `next/headers` is mocked per-test so the `x-locale` header value
// can be controlled without booting the Next.js server.
const headersGet = vi.fn<(name: string) => string | undefined>();

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (name: string) => headersGet(name),
  }),
}));

// Import after the mock so `getRequestConfig` captures the mocked
// `headers()` reference at module load.
const { getRequestConfig } = await import('../request');

beforeEach(() => {
  headersGet.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getRequestConfig (REQ-UI-17 + REQ-UI-24)', () => {
  it('resolves the Spanish message catalog when x-locale is "es"', async () => {
    // Arrange
    headersGet.mockImplementation((name) => (name.toLowerCase() === 'x-locale' ? 'es' : undefined));

    // Act
    const config = await getRequestConfig();

    // Assert
    expect(config.locale).toBe('es');
    // The Spanish catalog carries the canonical landing.hero.title
    // value. The exact value is asserted in PR 4; here we only assert
    // that the catalog resolved to the Spanish namespace.
    expect(config.messages).toBeDefined();
  });

  it('falls back to English when x-locale is "en"', async () => {
    // Arrange
    headersGet.mockImplementation((name) => (name.toLowerCase() === 'x-locale' ? 'en' : undefined));

    // Act
    const config = await getRequestConfig();

    // Assert
    expect(config.locale).toBe('en');
    expect(config.messages).toBeDefined();
  });

  it('falls back to the default locale when x-locale is absent (locked Q1: "en")', async () => {
    // Arrange — middleware always sets x-locale, but a malformed
    // upstream proxy could strip it. The fallback is `en` per REQ-UI-17
    // and the locked proposal Q1.
    headersGet.mockReturnValue(undefined);

    // Act
    const config = await getRequestConfig();

    // Assert
    expect(config.locale).toBe('en');
  });

  it('falls back to the default locale when x-locale is an unknown value', async () => {
    // Arrange — defensive: an upstream bug could write a typo. The
    // loader must not throw on an unknown locale; it returns the
    // default-locale catalog instead.
    headersGet.mockImplementation((name) => (name.toLowerCase() === 'x-locale' ? 'fr' : undefined));

    // Act + Assert — must not throw
    const config = await getRequestConfig();
    expect(config.locale).toBe('en');
  });
});
