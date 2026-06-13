/**
 * Domain entity: User. Plain TS — no Prisma imports. The
 * repository (T-016) maps Prisma rows to this shape before
 * handing them to the application layer.
 *
 * `normalizeEmail` is the single source of truth for
 * case-folding + trim + non-empty + format check. The
 * application layer never compares emails with raw
 * `===`; it normalizes first.
 */

import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'email must not be empty')
  .max(254)
  .email('invalid email format')
  .transform((s) => s.toLowerCase());

export type Email = z.infer<typeof emailSchema>;

/** Normalize an email for storage / lookup. Throws on invalid input. */
export function normalizeEmail(input: string): Email {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`invalid email: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  }
  return parsed.data;
}

export type DefaultProvider = 'local' | 'google';

export interface User {
  readonly id: string;
  readonly email: Email;
  readonly name: string | null;
  readonly image: string | null;
  readonly passwordHash: string | null;
  readonly defaultProvider: DefaultProvider;
  readonly lastLoginAt: Date | null;
  readonly emailVerified: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A snapshot used to insert a new user. The repository sets `id`, `createdAt`, `updatedAt`. */
export interface NewUser {
  email: Email;
  name: string | null;
  image: string | null;
  passwordHash: string | null;
  defaultProvider: DefaultProvider;
}
