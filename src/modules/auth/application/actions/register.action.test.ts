import { describe, it, expect, vi } from 'vitest';
import { registerAction } from './register.action';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import type { UserRepositoryPort } from '@/modules/auth/domain/interfaces/user.repository.port';
import type { PasswordHasherPort } from '@/modules/auth/domain/interfaces/password-hasher.port';
import type { User, NewUser, DefaultProvider } from '@/modules/auth/domain/entities/user';
import { EventDispatcher } from '@/shared/events/event-dispatcher';
import { systemClock } from '@/shared/clock/system-clock';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

const buildSvc = (opts: {
  findByEmailResult?: User | null;
  createResult?: User;
}): {
  svc: AuthService;
  users: UserRepositoryPort;
  hasher: PasswordHasherPort;
  dispatcher: EventDispatcher;
} => {
  const users: UserRepositoryPort = {
    create: vi.fn(
      async (input: NewUser): Promise<User> =>
        opts.createResult ?? {
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
        },
    ),
    findById: vi.fn(async () => null),
    findByEmail: vi.fn(async () => opts.findByEmailResult ?? null),
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
  const dispatcher = new EventDispatcher();
  return {
    svc: new AuthService(users, hasher, dispatcher, systemClock),
    users,
    hasher,
    dispatcher,
  };
};

describe('registerAction', () => {
  it('returns 201 with the PublicUser projection on success', async () => {
    const { svc } = buildSvc({});
    const res = await registerAction(svc, { email: 'A@B.com', password: 'a-strong-password-1234' });
    expect(res.status).toBe(201);
    if (res.status === 201) {
      expect(res.data).toEqual({
        id: 'u-new',
        email: 'a@b.com',
        name: null,
        image: null,
        defaultProvider: 'local',
        lastLoginAt: null,
      });
    }
  });

  it('returns 400 VALIDATION_ERROR on malformed input', async () => {
    const { svc } = buildSvc({});
    const res = await registerAction(svc, {
      email: 'not-an-email',
      password: 'a-strong-password-1234',
    });
    expect(res.status).toBe(400);
    if (res.status === 400) {
      expect(res.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it('returns 400 WEAK_PASSWORD on a password shorter than 10 chars', async () => {
    const { svc } = buildSvc({});
    const res = await registerAction(svc, { email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
    if (res.status === 400) {
      expect(res.error.code).toBe(ErrorCode.WEAK_PASSWORD);
    }
  });

  it('returns 409 EMAIL_TAKEN with timing-equalized hash call (BR-AUTH-4)', async () => {
    const { svc, hasher, users } = buildSvc({
      findByEmailResult: {
        id: 'u-existing',
        email: 'a@b.com',
        name: null,
        image: null,
        passwordHash: '$argon2id$h',
        defaultProvider: 'local',
        lastLoginAt: null,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const hashSpy = hasher.hash as unknown as ReturnType<typeof vi.fn>;
    const createSpy = users.create as unknown as ReturnType<typeof vi.fn>;

    const res = await registerAction(svc, { email: 'a@b.com', password: 'a-strong-password-1234' });

    expect(res.status).toBe(409);
    if (res.status === 409) {
      expect(res.error.code).toBe(ErrorCode.EMAIL_TAKEN);
    }
    // F-06 / BR-AUTH-4: the hasher ran exactly once on the
    // duplicate path (timing equalization). The repo
    // never created the user.
    expect(hashSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('dispatches UserRegistered exactly once on first registration', async () => {
    const { svc, dispatcher } = buildSvc({});
    const spy = vi.fn();
    dispatcher.subscribe('UserRegistered', spy);
    const res = await registerAction(svc, { email: 'A@B.com', password: 'a-strong-password-1234' });
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns 500 INTERNAL_ERROR on an unexpected AppError (e.g. UNAUTHORIZED)', async () => {
    // Construct a service whose register throws an AppError
    // with a code the action does not specifically handle.
    const users: UserRepositoryPort = {
      create: vi.fn(async () => {
        throw new AppError({ code: ErrorCode.UNAUTHORIZED, message: 'should not reach' });
      }),
      findById: vi.fn(async () => null),
      findByEmail: vi.fn(async () => null),
      update: vi.fn(async () => {
        throw new Error('unused');
      }),
    };
    const hasher: PasswordHasherPort = {
      hash: vi.fn(async (s: string) => s),
      verify: vi.fn(async () => false),
    };
    const dispatcher = new EventDispatcher();
    const svc = new AuthService(users, hasher, dispatcher, systemClock);
    const res = await registerAction(svc, { email: 'a@b.com', password: 'a-strong-password-1234' });
    expect(res.status).toBe(500);
    if (res.status === 500) {
      expect(res.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      // The original message is NEVER leaked to the client.
      expect(res.error.message).not.toContain('should not reach');
    }
  });
});
