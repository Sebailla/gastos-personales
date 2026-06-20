import { describe, it, expect, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { UserRepositoryPort } from '../interfaces/user.repository.port';
import type { PasswordHasherPort } from '../interfaces/password-hasher.port';
import type { User, NewUser } from '../entities/user';
import { Argon2idHasher } from '@/modules/auth/infrastructure/external/argon2.hasher';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import { EventDispatcher } from '@/shared/events/event-dispatcher';
import { PublicUser } from '../value-objects/public-user';
import { systemClock } from '@/shared/clock/system-clock';
import type { DefaultProvider } from '../entities/user';

const buildRepoStub = (): {
  repo: UserRepositoryPort;
  spy: {
    create: ReturnType<typeof vi.fn>;
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
} => {
  const create = vi.fn(
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
  );
  const findByEmail = vi.fn(async (_email: string): Promise<User | null> => null);
  const findById = vi.fn(async (_id: string): Promise<User | null> => null);
  const update = vi.fn(
    async (id: string, patch: Partial<NewUser> & { lastLoginAt?: Date }): Promise<User> => ({
      id,
      email: patch.email ?? 'a@b.com',
      name: patch.name ?? null,
      image: patch.image ?? null,
      passwordHash: patch.passwordHash ?? null,
      defaultProvider: (patch.defaultProvider ?? 'local') as DefaultProvider,
      lastLoginAt: patch.lastLoginAt ?? null,
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
  return {
    repo: { create, findByEmail, findById, update },
    spy: { create, findByEmail, findById, update },
  };
};

const buildHasherStub = (): {
  hasher: PasswordHasherPort;
  spy: { hash: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
} => {
  const hash = vi.fn(async (s: string) => `$argon2id$fake-hash-of:${s}`);
  const verify = vi.fn(async () => true);
  return { hasher: { hash, verify }, spy: { hash, verify } };
};

const buildDispatcherStub = (): {
  dispatcher: EventDispatcher;
  spy: ReturnType<typeof vi.fn>;
} => {
  const spy = vi.fn(async () => undefined);
  const dispatcher = new EventDispatcher();
  dispatcher.subscribe('UserRegistered', spy);
  dispatcher.subscribe('UserSignedIn', spy);
  return { dispatcher, spy };
};

const samplePassword = 'a-very-strong-password-1234';

describe('AuthService.register', () => {
  it('hashes the password and creates a user with defaultProvider=local', async () => {
    const { repo, spy } = buildRepoStub();
    const { hasher } = buildHasherStub();
    const { dispatcher } = buildDispatcherStub();
    const svc = new AuthService(repo, hasher, dispatcher, systemClock);

    const result = await svc.register({ email: 'A@B.com', password: samplePassword });

    expect(result.id).toBe('u-new');
    expect(result.email).toBe('a@b.com'); // normalized
    expect(result.defaultProvider).toBe('local');
    expect(spy.create).toHaveBeenCalledTimes(1);
    const created = spy.create.mock.calls[0]?.[0] as NewUser;
    expect(created.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('throws EMAIL_TAKEN on duplicate email, with the hasher invoked to equalize timing (BR-AUTH-4)', async () => {
    const { repo, spy } = buildRepoStub();
    const { hasher, spy: hasherSpy } = buildHasherStub();
    const { dispatcher } = buildDispatcherStub();
    spy.findByEmail.mockResolvedValue({
      id: 'existing',
      email: 'a@b.com',
      name: null,
      image: null,
      passwordHash: '$argon2id$existing',
      defaultProvider: 'local',
      lastLoginAt: null,
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const svc = new AuthService(repo, hasher, dispatcher, systemClock);

    // F-06: a single register call drives both the
    // `AppError` class check AND the `code` check, so the
    // timing-equalization hash count is asserted exactly.
    try {
      await svc.register({ email: 'a@b.com', password: samplePassword });
      expect.fail('expected register to throw on duplicate email');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ErrorCode.EMAIL_TAKEN);
    }
    // BR-AUTH-4: the hasher.hash was invoked exactly once
    // on the duplicate path (timing equalization). The
    // repo's create is never called.
    expect(hasherSpy.hash).toHaveBeenCalledTimes(1);
    expect(spy.create).not.toHaveBeenCalled();
  });

  it('dispatches UserRegistered exactly once on success', async () => {
    const { repo } = buildRepoStub();
    const { hasher } = buildHasherStub();
    const { dispatcher, spy } = buildDispatcherStub();
    const svc = new AuthService(repo, hasher, dispatcher, systemClock);

    await svc.register({ email: 'A@B.com', password: samplePassword });

    const userRegisteredCalls = spy.mock.calls.filter((call) => {
      const ev = call[0] as { type: string };
      return ev.type === 'UserRegistered';
    });
    expect(userRegisteredCalls).toHaveLength(1);
  });

  it('propagates the clock time as UserRegistered.occurredAt', async () => {
    const { repo } = buildRepoStub();
    const { hasher } = buildHasherStub();
    const dispatcher = new EventDispatcher();
    const fixed = new Date('2026-06-19T12:00:00.000Z');
    const fixedClock = { now: () => fixed };
    const evtSpy = vi.fn();
    dispatcher.subscribe('UserRegistered', evtSpy);
    const svc = new AuthService(repo, hasher, dispatcher, fixedClock);

    await svc.register({ email: 'A@B.com', password: samplePassword });

    expect(evtSpy).toHaveBeenCalledTimes(1);
    const event = evtSpy.mock.calls[0]?.[0] as { payload: { occurredAt: string } };
    expect(event.payload.occurredAt).toBe(fixed.toISOString());
  });

  it('does NOT dispatch UserRegistered on EMAIL_TAKEN', async () => {
    const { repo, spy } = buildRepoStub();
    const { hasher } = buildHasherStub();
    const dispatcher = new EventDispatcher();
    spy.findByEmail.mockResolvedValue({
      id: 'existing',
      email: 'a@b.com',
      name: null,
      image: null,
      passwordHash: '$argon2id$existing',
      defaultProvider: 'local',
      lastLoginAt: null,
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const dSpy = vi.fn();
    dispatcher.subscribe('UserRegistered', dSpy);
    const svc = new AuthService(repo, hasher, dispatcher, systemClock);

    await expect(
      svc.register({ email: 'a@b.com', password: samplePassword }),
    ).rejects.toBeInstanceOf(AppError);
    expect(dSpy).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 10 characters with WEAK_PASSWORD (BR-AUTH-2)', async () => {
    const { repo } = buildRepoStub();
    const { hasher } = buildHasherStub();
    const { dispatcher } = buildDispatcherStub();
    const svc = new AuthService(repo, hasher, dispatcher, systemClock);

    // F-06: single call to assert both class and code so
    // the hash count is exactly zero (the password check
    // happens BEFORE the duplicate-email path that hashes).
    try {
      await svc.register({ email: 'a@b.com', password: 'short' });
      expect.fail('expected register to throw on weak password');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ErrorCode.WEAK_PASSWORD);
    }
    expect(hasher.hash).not.toHaveBeenCalled();
  });
});

describe('AuthService.buildPublicUser', () => {
  it('returns the projection with no passwordHash and no emailVerified', async () => {
    const { repo, spy } = buildRepoStub();
    const { hasher } = buildHasherStub();
    const { dispatcher } = buildDispatcherStub();
    spy.findById.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      image: null,
      passwordHash: '$argon2id$h',
      defaultProvider: 'google',
      lastLoginAt: new Date('2026-06-12T10:00:00Z'),
      emailVerified: new Date('2026-06-12T10:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const svc = new AuthService(repo, hasher, dispatcher, systemClock);

    const projection = await svc.buildPublicUser('u1');

    expect(projection).toEqual(
      PublicUser.from({
        id: 'u1',
        email: 'a@b.com',
        name: 'Alice',
        image: null,
        passwordHash: '$argon2id$h',
        defaultProvider: 'google',
        lastLoginAt: new Date('2026-06-12T10:00:00Z'),
        emailVerified: new Date('2026-06-12T10:00:00Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    expect(projection).not.toHaveProperty('passwordHash');
    expect(projection).not.toHaveProperty('emailVerified');
  });

  it('returns null for an unknown user', async () => {
    const { repo } = buildRepoStub();
    const { hasher } = buildHasherStub();
    const { dispatcher } = buildDispatcherStub();
    const svc = new AuthService(repo, hasher, dispatcher, systemClock);

    expect(await svc.buildPublicUser('missing')).toBeNull();
  });
});

describe('AuthService.applyDefaultProviderOnOAuth', () => {
  it('preserves the existing defaultProvider (BR-AUTH-13)', async () => {
    const { repo, spy } = buildRepoStub();
    const { hasher } = buildHasherStub();
    const { dispatcher } = buildDispatcherStub();
    spy.findById.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: null,
      image: null,
      passwordHash: null,
      defaultProvider: 'google',
      lastLoginAt: null,
      emailVerified: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const svc = new AuthService(repo, hasher, dispatcher, systemClock);

    await svc.applyDefaultProviderOnOAuth('u1', 'google');

    // The policy keeps 'google'; update is not called because
    // the value did not change.
    expect(spy.update).not.toHaveBeenCalled();
  });
});

// Sanity: the concrete hasher the infrastructure provides implements
// the port the domain depends on, end-to-end.
describe('Argon2idHasher <-> PasswordHasherPort', () => {
  it('concrete hasher satisfies the port and round-trips a real hash', async () => {
    const hasher: PasswordHasherPort = new Argon2idHasher();
    const hash = await hasher.hash(samplePassword);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(hash, samplePassword)).toBe(true);
    expect(await hasher.verify(hash, 'wrong-password-9999')).toBe(false);
  });
});
