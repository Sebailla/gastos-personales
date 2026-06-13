/**
 * Public projection of a User — the shape the application
 * layer returns to the UI. NEVER includes `passwordHash`,
 * `emailVerified`, `createdAt`, or `updatedAt`. The spec
 * pins the JSON shape (MeSuccess, RegisterSuccess); the
 * domain layer constructs this object, the application
 * layer wraps it in `{ data: ... }`.
 */

import type { User } from '../entities/user';

export interface PublicUserShape {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  defaultProvider: 'local' | 'google';
  lastLoginAt: string | null;
}

export const PublicUser = {
  from(user: User): PublicUserShape {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      defaultProvider: user.defaultProvider,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  },
} as const;
