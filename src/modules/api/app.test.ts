import { describe, it, expect, vi } from 'vitest';
import { createHonoApp, type HonoAppDeps } from './app';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import type { UserRepositoryPort } from '@/modules/auth/domain/interfaces/user.repository.port';
import type { PasswordHasherPort } from '@/modules/auth/domain/interfaces/password-hasher.port';
import type { User, NewUser, DefaultProvider } from '@/modules/auth/domain/entities/user';
import { EventDispatcher } from '@/shared/events/event-dispatcher';
import { ErrorCode } from '@/shared/errors/error-codes';
import { systemClock } from '@/shared/clock/system-clock';
import { AccountService } from '@/modules/accounts';
import { FxRateProviderStub } from '@/modules/accounts/infrastructure/external/fx-rate-provider.stub';
import { _resetLimiterCacheForTests } from '@/shared/rate-limit/rate-limit';

const buildSvc = (findByIdResult: User | null): AuthService => {
  const users: UserRepositoryPort = {
    create: vi.fn(
      async (input: NewUser): Promise<User> => ({
        id: 'u-new',
        email: input.email,
        name: input.name,
        image: input.image,
        passwordHash: input.passwordHash,
        defaultProvider: input.defaultProvider,
        lastLoginAt: null,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    findById: vi.fn(async () => findByIdResult),
    findByEmail: vi.fn(async () => null),
    update: vi.fn(async (id: string) => ({
      id,
      email: 'a@b.com',
      name: null,
      image: null,
      passwordHash: null,
      defaultProvider: 'local' as DefaultProvider,
      lastLoginAt: null,
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  };
  const hasher: PasswordHasherPort = {
    hash: vi.fn(async (s: string) => `$argon2id$fake:${s}`),
    verify: vi.fn(async () => true),
  };
  return new AuthService(users, hasher, new EventDispatcher(), systemClock);
};

const buildDeps = (svc: AuthService, authjsAuth: HonoAppDeps['authjsAuth']): HonoAppDeps => ({
  authService: svc,
  authjsAuth,
  accountService: {
    list: vi.fn(),
    count: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    getBalance: vi.fn(),
  } as unknown as AccountService,
  fxRateProvider: new FxRateProviderStub(),
});

describe('createHonoApp', () => {
  it('GET /api/health returns 200 with { status, version, uptime }', async () => {
    const authjsAuthSpy = vi.fn(async () => null);
    const app = createHonoApp(buildDeps(buildSvc(null), authjsAuthSpy));
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.version).toBe('string');
    expect(typeof body.data.uptime).toBe('number');
    // F-03: liveness probe MUST NOT trigger the session
    // lookup. A DB-down incident would otherwise cascade
    // into a process restart.
    expect(authjsAuthSpy).not.toHaveBeenCalled();
  });

  it('GET /api/me returns 200 with the PublicUser projection when the session resolves', async () => {
    const svc = buildSvc({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      image: null,
      passwordHash: '$argon2id$h',
      defaultProvider: 'google',
      lastLoginAt: new Date('2026-06-12T10:00:00Z'),
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const app = createHonoApp(
      buildDeps(svc, async () => ({ user: { id: 'u1', email: 'a@b.com' } })),
    );
    const res = await app.request('/api/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('u1');
  });

  it('GET /api/me returns 401 UNAUTHORIZED when there is no session', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('POST /api/auth/register returns 201 on a well-formed registration', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'A@B.com', password: 'a-strong-password-1234' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.email).toBe('a@b.com');
  });

  it('GET /api/readyz is mounted (F9)', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/api/readyz');
    // The action either 200 (DB up) or 503 (DB down). The
    // route existence is what we assert here: the status
    // is never 404.
    expect(res.status).not.toBe(404);
  });

  it('POST /api/auth/register returns 400 on a malformed body', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'a-strong-password-1234' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/register returns 403 on a cross-origin POST', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
      },
      body: JSON.stringify({ email: 'a@b.com', password: 'a-strong-password-1234' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCode.FORBIDDEN);
  });
});

// F2: the rate-limit guard on /auth/register. We spy on
// `assertWithinRateLimit` so the test is deterministic
// without needing a real Upstash Redis. The 429 mapping
// from `RateLimitError` to the response envelope is
// covered in `error-handler.test.ts` (F2 wiring) and the
// unit test here proves the route actually invokes the
// guard with the right identifier.
describe('POST /auth/register — rate limit (F2)', () => {
  it('calls assertWithinRateLimit with `register:<ip>` on every request', async () => {
    const rateLimitModule = await import('@/shared/rate-limit/rate-limit');
    const spy = vi.spyOn(rateLimitModule, 'assertWithinRateLimit');
    spy.mockResolvedValue({ success: true, remaining: 4, reset: 60_000, limit: 5 });

    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'rl@x.com', password: 'a-strong-password-1234' }),
    });
    expect(spy).toHaveBeenCalledWith('register:anonymous:unknown');
    spy.mockRestore();
  });

  it('returns 429 RATE_LIMITED when assertWithinRateLimit throws (second call within window)', async () => {
    const rateLimitModule = await import('@/shared/rate-limit/rate-limit');
    const spy = vi.spyOn(rateLimitModule, 'assertWithinRateLimit');
    // `resetMs` is a Unix-timestamp-ms (Upstash contract),
    // not a duration. Use a realistic value to exercise the
    // production path (`(resetMs - now) / 1000`).
    spy.mockRejectedValue(
      new rateLimitModule.RateLimitError(
        'Rate limit exceeded for register:1.2.3.4',
        Date.now() + 30_000,
        5,
      ),
    );

    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '1.2.3.4',
      },
      body: JSON.stringify({ email: 'rl@x.com', password: 'a-strong-password-1234' }),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCode.RATE_LIMITED);
    // Allow a small slack for CI timer drift.
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(29);
    expect(retryAfter).toBeLessThanOrEqual(31);
    spy.mockRestore();
  });
});

// Keep the default `honoApp` export alive (used by the
// production route mount in T-025). The default factory
// returns a null-session resolver, which is safe for
// dev-mode boot.
import { honoApp } from './index';
describe('honoApp (default export)', () => {
  // F-16: the previous assertion was tautological. This
  // smoke test actually drives the app and checks the
  // liveness response, which exercises the route table
  // and the error handler end-to-end.
  it('responds 200 to GET /api/health with status=ok', async () => {
    const res = await honoApp.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe('ok');
  });
});
