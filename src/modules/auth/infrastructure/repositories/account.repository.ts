/**
 * AccountRepository — Prisma adapter for the AccountRepositoryPort.
 *
 * The Auth.js Prisma adapter owns the read/write path for
 * `Account`; the application code in this change does not
 * call `create` directly. The repository is here for
 * completeness (it satisfies the port) and to allow a
 * future change to write a non-Auth.js code path that does
 * need to manage `Account` rows.
 */

import type { Account } from '../../domain/entities/account';
import type {
  AccountRepositoryPort,
  NewAccount,
} from '../../domain/interfaces/account.repository.port';

interface PrismaAccountDelegate {
  create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  findUnique: (args: { where: { provider_providerAccountId: { provider: string; providerAccountId: string } } }) => Promise<Record<string, unknown> | null>;
}

export class AccountRepository implements AccountRepositoryPort {
  constructor(private readonly prisma: { account: PrismaAccountDelegate }) {}

  async create(account: NewAccount): Promise<Account> {
    const row = await this.prisma.account.create({ data: { ...account } });
    return mapRow(row);
  }

  async findUnique(provider: string, providerAccountId: string): Promise<Account | null> {
    const row = await this.prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
    });
    return row ? mapRow(row) : null;
  }
}

function mapRow(row: Record<string, unknown>): Account {
  return {
    id: row['id'] as string,
    userId: row['userId'] as string,
    type: row['type'] as string,
    provider: row['provider'] as string,
    providerAccountId: row['providerAccountId'] as string,
    access_token: (row['access_token'] as string | null) ?? null,
    refresh_token: (row['refresh_token'] as string | null) ?? null,
    expires_at: (row['expires_at'] as number | null) ?? null,
    token_type: (row['token_type'] as string | null) ?? null,
    scope: (row['scope'] as string | null) ?? null,
    id_token: (row['id_token'] as string | null) ?? null,
    session_state: (row['session_state'] as string | null) ?? null,
  };
}
