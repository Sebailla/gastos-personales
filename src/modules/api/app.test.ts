import { describe, it, expect, vi } from 'vitest';
import { createHonoApp, type HonoAppDeps } from './app';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import type { UserRepositoryPort } from '@/modules/auth/domain/interfaces/user.repository.port';
import type { PasswordHasherPort } from '@/modules/auth/domain/interfaces/password-hasher.port';
import type { User, NewUser, DefaultProvider } from '@/modules/auth/domain/entities/user';
import { EventDispatcher } from '@/shared/events/event-dispatcher';
import { ErrorCode } from '@/shared/errors/error-codes';
import { AccountService } from '@/modules/accounts';
import { FxRateProviderStub } from '@/modules/accounts/infrastructure/external/fx-rate-provider.stub';

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
  return new AuthService(users, hasher, new EventDispatcher());
};

const buildDeps = (svc: AuthService, authjsAuth: HonoAppDeps['authjsAuth']): HonoAppDeps => ({
  authService: svc,
  authjsAuth,
  accountService: {
    list: vi.fn(),
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
  it('GET /health returns 200 with { status, version, uptime }', async () => {
    const app = createHonoApp(buildDeps(buildSvc(null), async () => null));
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.version).toBe('string');
    expect(typeof body.data.uptime).toBe('number');
  });

  it('GET /me returns 200 with the PublicUser projection when the session resolves', async () => {
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
    const res = await app.request('/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('u1');
  });

  it('GET /me returns 401 UNAUTHORIZED when there is no session', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/me');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('POST /auth/register returns 201 on a well-formed registration', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'A@B.com', password: 'a-strong-password-1234' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.email).toBe('a@b.com');
  });

  it('POST /auth/register returns 400 on a malformed body', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'a-strong-password-1234' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /auth/register returns 403 on a cross-origin POST', async () => {
    const svc = buildSvc(null);
    const app = createHonoApp(buildDeps(svc, async () => null));
    const res = await app.request('/auth/register', {
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

// Keep the default `honoApp` export alive (used by the
// production route mount in T-025). The default factory
// returns a null-session resolver, which is safe for
// dev-mode boot. The shape is asserted at compile time
// by the `AppType` alias; no runtime check is needed
// beyond the import side-effect of `import { honoApp }`.
import { honoApp } from './index';
describe('honoApp (default export)', () => {
  it('is a Hono-compatible instance with a request method', () => {
    expect(typeof honoApp.request).toBe('function');
  });
});
