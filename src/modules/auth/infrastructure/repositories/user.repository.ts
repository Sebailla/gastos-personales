/**
 * UserRepository — Prisma adapter for the UserRepositoryPort.
 *
 * The application passes the Prisma client through the
 * singleton at `src/shared/db/prisma.ts`. Tests substitute
 * a fake via the constructor argument. Mapping from Prisma
 * rows to the domain `User` shape happens here; the rest
 * of the codebase never sees a Prisma row.
 */

import {
  normalizeEmail,
  type Email,
  type NewUser,
  type User,
  type DefaultProvider,
} from '../../domain/entities/user';
import type { UserRepositoryPort } from '../../domain/interfaces/user.repository.port';
import type { PrismaUserDelegate } from '@/shared/db/prisma-types';

// The narrow `PrismaUserDelegate` view comes from
// `@/shared/db/prisma-types` (F-14). The composition root
// passes the real `PrismaClient` cast through
// `asPrismaDelegateView`; the test substitutes a fake that
// satisfies the same shared interface.

export class UserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: { user: PrismaUserDelegate }) {}

  async create(user: NewUser): Promise<User> {
    // Defense in depth: normalize email at the repository layer
    // even if the caller passed a non-normalized string. The
    // application layer normalizes first; the repository is
    // the last line of defense.
    const normalizedEmail = normalizeEmail(user.email);
    const row = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: user.name,
        image: user.image,
        passwordHash: user.passwordHash,
        defaultProvider: user.defaultProvider,
      },
    });
    return mapRow(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? mapRow(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    // Application normalizes; the repository lowercases defensively
    // so the lookup is case-insensitive (BR-AUTH-1).
    const normalized = normalizeEmail(email);
    const row = await this.prisma.user.findUnique({ where: { email: normalized } });
    return row ? mapRow(row) : null;
  }

  async update(id: string, patch: Partial<NewUser> & { lastLoginAt?: Date }): Promise<User> {
    const data: Record<string, unknown> = {};
    if (patch.email !== undefined) data['email'] = patch.email as Email;
    if (patch.name !== undefined) data['name'] = patch.name;
    if (patch.image !== undefined) data['image'] = patch.image;
    if (patch.passwordHash !== undefined) data['passwordHash'] = patch.passwordHash;
    if (patch.defaultProvider !== undefined) data['defaultProvider'] = patch.defaultProvider;
    if (patch.lastLoginAt !== undefined) data['lastLoginAt'] = patch.lastLoginAt;

    const row = await this.prisma.user.update({ where: { id }, data });
    return mapRow(row);
  }
}

function mapRow(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    email: row['email'] as Email,
    name: (row['name'] as string | null) ?? null,
    image: (row['image'] as string | null) ?? null,
    passwordHash: (row['passwordHash'] as string | null) ?? null,
    defaultProvider: row['defaultProvider'] as DefaultProvider,
    lastLoginAt: (row['lastLoginAt'] as Date | null) ?? null,
    emailVerified: (row['emailVerified'] as Date | null) ?? null,
    createdAt: row['createdAt'] as Date,
    updatedAt: row['updatedAt'] as Date,
  };
}
