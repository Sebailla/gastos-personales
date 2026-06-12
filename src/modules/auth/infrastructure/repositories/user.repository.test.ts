import { describe, it, expect, vi } from 'vitest';
import { UserRepository } from './user.repository';
import type { User } from '../../domain/entities/user';

const buildFakePrisma = () => {
  const user = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'u-new',
      ...args.data,
      emailVerified: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findUnique: vi.fn(),
    update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: args.where.id,
      ...args.data,
    })),
  };
  return { user };
};

describe('UserRepository', () => {
  it('create normalizes the email to lowercase before persisting', async () => {
    const { user } = buildFakePrisma();
    const repo = new UserRepository({ user: user as unknown as ConstructorParameters<typeof UserRepository>[0]['user'] });

    const created = await repo.create({
      email: 'MIXED@Example.COM' as unknown as User['email'],
      name: null,
      image: null,
      passwordHash: null,
      defaultProvider: 'local',
    });

    expect(user.create).toHaveBeenCalledTimes(1);
    const callArg = user.create.mock.calls[0]?.[0] as { data: { email: string } };
    expect(callArg.data.email).toBe('mixed@example.com');
    expect(created.email).toBe('mixed@example.com');
  });

  it('findByEmail is case-insensitive (lowercases before query)', async () => {
    const { user } = buildFakePrisma();
    const repo = new UserRepository({ user: user as unknown as ConstructorParameters<typeof UserRepository>[0]['user'] });

    await repo.findByEmail('A@B.COM');
    const callArg = user.findUnique.mock.calls[0]?.[0] as { where: { email: string } };
    expect(callArg.where.email).toBe('a@b.com');
  });

  it('findById returns null when the row is missing', async () => {
    const { user } = buildFakePrisma();
    user.findUnique.mockResolvedValue(null);
    const repo = new UserRepository({ user: user as unknown as ConstructorParameters<typeof UserRepository>[0]['user'] });

    expect(await repo.findById('missing')).toBeNull();
  });

  it('update mutates lastLoginAt and bumps updatedAt (delegated to Prisma @updatedAt)', async () => {
    const { user } = buildFakePrisma();
    const repo = new UserRepository({ user: user as unknown as ConstructorParameters<typeof UserRepository>[0]['user'] });

    await repo.update('u1', { lastLoginAt: new Date('2026-06-12T10:00:00Z') });

    const callArg = user.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { lastLoginAt: Date };
    };
    expect(callArg.where.id).toBe('u1');
    expect(callArg.data.lastLoginAt.toISOString()).toBe('2026-06-12T10:00:00.000Z');
  });
});
