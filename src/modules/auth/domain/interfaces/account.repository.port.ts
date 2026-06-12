/**
 * Port interface: AccountRepository. The Auth.js Prisma
 * adapter owns the read/write paths for the Auth.js-owned
 * tables (`Account`, `Session`, `VerificationToken`); the
 * application code in this change does NOT write to them
 * directly. The port is here for completeness and to allow
 * a future change to swap the adapter.
 */

import type { Account } from '../entities/account';

export interface NewAccount {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

export interface AccountRepositoryPort {
  create(account: NewAccount): Promise<Account>;
  findUnique(provider: string, providerAccountId: string): Promise<Account | null>;
}
