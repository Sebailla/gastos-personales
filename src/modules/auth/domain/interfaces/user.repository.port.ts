/**
 * Port interface: UserRepository. The auth domain's only
 * path to read or write `User` rows. Implemented in the
 * infrastructure layer by `UserRepository` (T-016) with the
 * Prisma client. The interface is intentionally small — only
 * the four operations the domain needs.
 *
 * "Case-insensitive lookup" is the application's job. The
 * repository does not assume anything about how the DB
 * stores case; it just queries with a normalized string.
 */

import type { NewUser, User } from '../entities/user';

export interface UserRepositoryPort {
  create(user: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, patch: Partial<NewUser> & { lastLoginAt?: Date }): Promise<User>;
}
