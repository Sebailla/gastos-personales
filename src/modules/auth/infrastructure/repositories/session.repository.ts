/**
 * SessionRepository — Prisma adapter for the SessionRepositoryPort.
 *
 * Like the AccountRepository, the application code in this
 * change does NOT call `create` / `delete` directly — Auth.js
 * does, on sign-in and sign-out. The port is here to allow a
 * future change (e.g. "sign out everywhere") to manage
 * sessions explicitly.
 */

import type { SessionRepositoryPort } from '../../domain/interfaces/session.repository.port';

interface PrismaSessionDelegate {
  findUnique: (args: { where: { sessionToken: string } }) => Promise<{ userId: string; expires: Date } | null>;
  delete: (args: { where: { sessionToken: string } }) => Promise<unknown>;
}

export class SessionRepository implements SessionRepositoryPort {
  constructor(private readonly prisma: { session: PrismaSessionDelegate }) {}

  async findByToken(token: string): Promise<{ userId: string; expires: Date } | null> {
    return this.prisma.session.findUnique({ where: { sessionToken: token } });
  }

  async delete(token: string): Promise<void> {
    await this.prisma.session.delete({ where: { sessionToken: token } });
  }
}
