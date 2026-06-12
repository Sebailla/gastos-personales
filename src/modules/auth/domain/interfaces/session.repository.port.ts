/**
 * Port interface: SessionRepository. The Auth.js Prisma
 * adapter owns the read/write paths for `Session`; the
 * application code does not touch this table directly.
 */

export interface SessionRepositoryPort {
  findByToken(token: string): Promise<{ userId: string; expires: Date } | null>;
  delete(token: string): Promise<void>;
}
