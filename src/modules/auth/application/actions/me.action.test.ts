import { describe, it, expect, vi } from 'vitest';
import { meAction } from './me.action';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import type { UserRepositoryPort } from '@/modules/auth/domain/interfaces/user.repository.port';
import type { PasswordHasherPort } from '@/modules/auth/domain/interfaces/password-hasher.port';
import type { User, NewUser, DefaultProvider } from '@/modules/auth/domain/entities/user';
import { EventDispatcher } from '@/shared/events/event-dispatcher';
import { ErrorCode } from '@/shared/errors/error-codes';
import { systemClock } from '@/shared/clock/system-clock';
import type { Context } from 'hono';

const buildSvc = (findByIdResult: User | null): AuthService => {
  const users: UserRepositoryPort = {
    create: vi.fn(
      async (input: NewUser): Promise<User> => ({
        id: 'x',
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
    hash: vi.fn(async (s: string) => s),
    verify: vi.fn(async () => false),
  };
  return new AuthService(users, hasher, new EventDispatcher(), systemClock);
};

const buildContext = (user: { id: string; email: string } | null): Context => {
  const ctx = {
    get: (key: string) => (key === 'user' ? user : undefined),
  };
  return ctx as unknown as Context;
};

describe('meAction', () => {
  it('returns 200 with the PublicUser projection when the session resolves', async () => {
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
    const ctx = buildContext({ id: 'u1', email: 'a@b.com' });
    const res = await meAction(svc, ctx);
    expect(res.status).toBe(200);
    if (res.status === 200) {
      expect(res.data.id).toBe('u1');
      expect(res.data.email).toBe('a@b.com');
      expect(res.data.name).toBe('Alice');
      expect(res.data.defaultProvider).toBe('google');
    }
  });

  it.each([['no user on context', null]])(
    'returns 401 UNAUTHORIZED when %s',
    async (_label, ctxUser) => {
      const svc = buildSvc({
        id: 'u1',
        email: 'a@b.com',
        name: null,
        image: null,
        passwordHash: null,
        defaultProvider: 'local',
        lastLoginAt: null,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ctx = buildContext(ctxUser);
      const res = await meAction(svc, ctx);
      expect(res.status).toBe(401);
      if (res.status === 401) {
        expect(res.error.code).toBe(ErrorCode.UNAUTHORIZED);
      }
    },
  );

  it('returns 401 UNAUTHORIZED when the user exists in the session but is not in the DB', async () => {
    // buildSvc(null) means findById returns null — simulates
    // the "expired session" / "unknown user" failure mode.
    const svc = buildSvc(null);
    const ctx = buildContext({ id: 'ghost', email: 'ghost@b.com' });
    const res = await meAction(svc, ctx);
    expect(res.status).toBe(401);
    if (res.status === 401) {
      expect(res.error.code).toBe(ErrorCode.UNAUTHORIZED);
    }
  });
});
