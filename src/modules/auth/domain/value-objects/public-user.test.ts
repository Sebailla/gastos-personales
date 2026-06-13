import { describe, it, expect } from 'vitest';
import { PublicUser } from './public-user';
import type { User } from '../entities/user';

const userFixture: User = {
  id: 'u1',
  email: 'a@b.com',
  name: 'Alice',
  image: 'https://img/a.png',
  passwordHash: '$argon2id$hashed',
  defaultProvider: 'local',
  lastLoginAt: new Date('2026-06-12T10:00:00Z'),
  emailVerified: null,
  createdAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: new Date('2026-06-12T10:00:00Z'),
};

describe('PublicUser.from', () => {
  it('strips passwordHash and emailVerified', () => {
    const projection = PublicUser.from(userFixture);
    expect(projection).not.toHaveProperty('passwordHash');
    expect(projection).not.toHaveProperty('emailVerified');
  });

  it('shapes the JSON the spec requires', () => {
    const projection = PublicUser.from(userFixture);
    expect(projection).toEqual({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      image: 'https://img/a.png',
      defaultProvider: 'local',
      lastLoginAt: '2026-06-12T10:00:00.000Z',
    });
  });

  it('serializes lastLoginAt as ISO 8601', () => {
    const projection = PublicUser.from({ ...userFixture, lastLoginAt: null });
    expect(projection.lastLoginAt).toBeNull();
  });
});
