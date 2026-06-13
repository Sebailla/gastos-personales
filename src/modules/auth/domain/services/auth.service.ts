/**
 * AuthService — the auth domain's orchestrator.
 *
 * Wires together the UserRepository port, the PasswordHasher
 * port, the in-process event dispatcher, and the value-object
 * projections. All business rules for the auth module live
 * here; the application layer (actions in Slice B) is a thin
 * Zod-validating wrapper.
 *
 * Behaviors:
 * - `register({ email, password })` — BR-AUTH-2 (min length 10),
 *   BR-AUTH-4 (timing equalization on duplicate email), the
 *   `UserRegistered` event dispatch on success.
 * - `applyDefaultProviderOnOAuth(userId, provider)` — BR-AUTH-13
 *   (never mutate after first registration).
 * - `buildPublicUser(userId)` — PublicUser projection; never
 *   leaks `passwordHash` or `emailVerified`.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { PasswordHasherPort } from '../interfaces/password-hasher.port';
import type { UserRepositoryPort } from '../interfaces/user.repository.port';
import type { DefaultProvider, NewUser } from '../entities/user';
import { normalizeEmail } from '../entities/user';
import { PublicUser, type PublicUserShape } from '../value-objects/public-user';
import { stampDefaultProvider } from './default-provider.policy';
import type { EventDispatcher, DomainEvent } from '@/shared/events/event-dispatcher';
import { UserRegistered } from '@/shared/events/event-dispatcher';

export interface RegisterInput {
  email: string;
  password: string;
}

const MIN_PASSWORD_LENGTH = 10;

/** Fixed plaintext used for timing-equalization on duplicate email.
 *  The hash result is thrown away; the value itself only matters
 *  insofar as the work performed by the hasher is comparable to
 *  the real-password path (BR-AUTH-4). */
const TIMING_EQUALIZER_PLAINTEXT = 'equalize-timing-equalize-timing-AAAA';

export class AuthService {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly hasher: PasswordHasherPort,
    private readonly dispatcher: EventDispatcher,
  ) {}

  async register({ email, password }: RegisterInput): Promise<PublicUserShape> {
    const normalizedEmail = normalizeEmail(email);
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError({
        code: ErrorCode.WEAK_PASSWORD,
        message: 'La contraseña debe tener al menos 10 caracteres.',
      });
    }

    // Look up by normalized email first (BR-AUTH-1).
    const existing = await this.users.findByEmail(normalizedEmail);

    if (existing) {
      // BR-AUTH-4: equalize timing by hashing a fixed throwaway
      // string even on the duplicate path.
      await this.hasher.hash(TIMING_EQUALIZER_PLAINTEXT);
      throw new AppError({
        code: ErrorCode.EMAIL_TAKEN,
        message: 'El email ya está registrado.',
      });
    }

    const passwordHash = await this.hasher.hash(password);
    const newUser: NewUser = {
      email: normalizedEmail,
      name: null,
      image: null,
      passwordHash,
      defaultProvider: 'local',
    };
    const created = await this.users.create(newUser);

    // Dispatch UserRegistered exactly once on first registration.
    const event: DomainEvent = {
      type: UserRegistered,
      payload: {
        userId: created.id,
        email: created.email,
        provider: 'local',
        occurredAt: new Date().toISOString(),
      },
    };
    await this.dispatcher.dispatch(event);

    return PublicUser.from(created);
  }

  async applyDefaultProviderOnOAuth(
    userId: string,
    provider: DefaultProvider,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: 'User not found.',
      });
    }
    const next = stampDefaultProvider(user.defaultProvider, provider);
    if (next !== user.defaultProvider) {
      await this.users.update(userId, { defaultProvider: next });
    }
  }

  async buildPublicUser(userId: string): Promise<PublicUserShape | null> {
    const user = await this.users.findById(userId);
    if (!user) return null;
    return PublicUser.from(user);
  }
}
