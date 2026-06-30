/**
 * RED → GREEN → TRIANGULATE coverage for the root `middleware.ts`.
 *
 * The middleware is the single point of locale resolution and
 * pathname propagation for the App Router. It is responsible for:
 *
 *   1. Resolving the active locale per REQ-UI-17 precedence:
 *      `NEXT_LOCALE` cookie → `Accept-Language` → default `en`.
 *   2. Injecting two custom request headers that Server Components
 *      read at render time:
 *        - `x-locale` — the resolved locale (consumed by
 *          `src/i18n/request.ts` and by `<AppShell>` for its chrome
 *          decision).
 *        - `x-pathname` — the original request path (consumed by
 *          `<AppShell>` to decide which chrome to mount per the
 *          pathname matrix in design §Architecture).
 *
 * The middleware MUST never redirect a request whose resolved locale
 * matches the default (`localePrefix: 'as-needed'`).
 *
 * Test-environment note: `next/server` is a CommonJS module that Vite
 * cannot resolve through `next-intl/middleware`'s bare import chain
 * without a project-wide `optimizeDeps` allow-list entry. The
 * project-wide precedent (see `app/auth/signin/page.test.ts`) is to
 * mock `next/server` for the unit-test surface; the wrapper itself
 * works at runtime because Next.js's bundler resolves the bare
 * import natively.
 */

import { describe, expect, it, vi } from 'vitest';

// `next/server` is mocked with a minimal `NextResponse`-shaped stub.
// `NextRequest` is re-exported from `undici`'s `Request` (already
// available in the Node runtime via the standard library), which
// is sufficient for the test surface used here.
class FakeHeaders {
  private readonly store = new Map<string, string>();

  set(name: string, value: string): void {
    this.store.set(name.toLowerCase(), value);
  }

  get(name: string): string | undefined {
    return this.store.get(name.toLowerCase());
  }
}

class FakeNextResponse {
  readonly headers = new FakeHeaders();

  static next(): FakeNextResponse {
    return new FakeNextResponse();
  }
}

interface NextRequestLike {
  readonly headers: Headers;
  readonly cookies: { get(name: string): { value: string } | undefined };
  readonly nextUrl: { pathname: string };
}

class FakeNextRequest implements NextRequestLike {
  readonly headers: Headers;
  readonly cookies: { get(name: string): { value: string } | undefined };
  readonly nextUrl: { pathname: string };

  constructor(url: string, init?: RequestInit) {
    this.headers = new Headers(init?.headers);
    const parsed = new URL(url);
    this.nextUrl = { pathname: parsed.pathname };
    this.cookies = {
      get: (name: string) => {
        const raw = this.headers.get('cookie');
        if (!raw) return undefined;
        for (const segment of raw.split(';')) {
          const [k, ...rest] = segment.trim().split('=');
          if (k === name) {
            return { value: decodeURIComponent(rest.join('=')) };
          }
        }
        return undefined;
      },
    };
  }
}

vi.mock('next/server', () => ({
  NextRequest: FakeNextRequest,
  NextResponse: FakeNextResponse,
}));

// `next-intl/middleware`'s default `createMiddleware` factory
// instantiates the intl routing config; we do not need the real
// factory because the wrapper under test sets the `x-locale` header
// based on its OWN resolution, not on the factory's. The fake
// returns a no-op `NextResponse.next()`.
vi.mock('next-intl/middleware', () => ({
  default: () => () => FakeNextResponse.next(),
}));

const { middleware } = await import('../../middleware');

const baseUrl = 'http://localhost:3000';

function requestFor(
  path: string,
  init: {
    acceptLanguage?: string;
    cookie?: string;
  } = {},
): InstanceType<typeof FakeNextRequest> {
  const headers: Record<string, string> = {};
  if (init.acceptLanguage) {
    headers['accept-language'] = init.acceptLanguage;
  }
  if (init.cookie) {
    headers['cookie'] = init.cookie;
  }
  return new FakeNextRequest(`${baseUrl}${path}`, { headers });
}

// `NextRequest` (the real type) has ~22 properties; the wrapper
// only touches `headers`, `cookies`, and `nextUrl`. We type the
// helper's return as `unknown` so the call site controls the cast
// without polluting every `requestFor(...)` invocation.
function asNextRequest(
  req: InstanceType<typeof FakeNextRequest>,
): Parameters<typeof middleware>[0] {
  return req as unknown as Parameters<typeof middleware>[0];
}

describe('middleware locale + header injection (REQ-UI-17)', () => {
  it('resolves es for Accept-Language headed by es-AR and injects x-locale', async () => {
    // Arrange
    const req = requestFor('/', {
      acceptLanguage: 'es-AR,es;q=0.9,en;q=0.8',
    });

    // Act
    const res = await middleware(asNextRequest(req));

    // Assert
    expect(res.headers.get('x-locale')).toBe('es');
  });

  it('resolves en for Accept-Language headed by en-US and injects x-locale', async () => {
    // Arrange
    const req = requestFor('/', {
      acceptLanguage: 'en-US,en;q=0.9',
    });

    // Act
    const res = await middleware(asNextRequest(req));

    // Assert
    expect(res.headers.get('x-locale')).toBe('en');
  });

  it('defaults to en for unsupported Accept-Language (locked Q1)', async () => {
    // Arrange — Japanese + French, no Spanish and no English
    const req = requestFor('/', {
      acceptLanguage: 'ja,fr;q=0.8',
    });

    // Act
    const res = await middleware(asNextRequest(req));

    // Assert
    expect(res.headers.get('x-locale')).toBe('en');
  });

  it('NEXT_LOCALE cookie wins over Accept-Language', async () => {
    // Arrange — Accept-Language says Spanish, cookie says English
    const req = requestFor('/', {
      acceptLanguage: 'es-AR,es;q=0.9,en;q=0.8',
      cookie: 'NEXT_LOCALE=en',
    });

    // Act
    const res = await middleware(asNextRequest(req));

    // Assert
    expect(res.headers.get('x-locale')).toBe('en');
  });

  it('injects x-pathname equal to the request path', async () => {
    // Arrange
    const req = requestFor('/auth/signin');

    // Act
    const res = await middleware(asNextRequest(req));

    // Assert
    expect(res.headers.get('x-pathname')).toBe('/auth/signin');
  });

  it('injects x-pathname === "/" for the root path', async () => {
    // Arrange
    const req = requestFor('/');

    // Act
    const res = await middleware(asNextRequest(req));

    // Assert
    expect(res.headers.get('x-pathname')).toBe('/');
  });
});
