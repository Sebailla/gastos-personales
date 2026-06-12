/**
 * Domain entity: Account. A link between a User and an
 * external identity provider. The shape mirrors the
 * Auth.js canonical schema (T-015) but lives in the
 * domain layer without any Prisma import.
 */

export interface Account {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly provider: string;
  readonly providerAccountId: string;
  readonly access_token: string | null;
  readonly refresh_token: string | null;
  readonly expires_at: number | null;
  readonly token_type: string | null;
  readonly scope: string | null;
  readonly id_token: string | null;
  readonly session_state: string | null;
}

/** Type guard used by the AccountRepository. */
export function isAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.userId === 'string' &&
    typeof v.type === 'string' &&
    typeof v.provider === 'string' &&
    typeof v.providerAccountId === 'string'
  );
}
