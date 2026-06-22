/**
 * EncryptedPrismaAdapter — Auth.js v5 adapter that wraps
 * `@auth/prisma-adapter` and encrypts OAuth tokens at rest
 * (4R-R1 CRITICAL-3).
 *
 * Why a wrapper, not a custom adapter: `@auth/prisma-adapter`
 * already implements every method on the `Adapter` interface
 * (User, Session, VerificationToken, etc.). The only Account
 * methods that touch token columns are `linkAccount` (write) and
 * `getUserByAccount` (read). Wrapping the standard adapter
 * means we re-implement only those two methods and delegate
 * the rest unchanged.
 *
 * Contract:
 *   - On `linkAccount`, the plaintext token fields
 *     (`refresh_token`, `access_token`, `id_token`) are
 *     encrypted via `encryptEnvelope` before the row is
 *     written. The DB stores the ciphertext (Bytes).
 *   - On `getUserByAccount`, the same fields are read as
 *     ciphertext and decrypted before the row is returned
 *     to the Auth.js callback. The caller sees plaintext.
 *
 * Key handling: the encryption key is read from
 * `process.env.OAUTH_TOKEN_ENCRYPTION_KEY` lazily on each
 * call. This avoids a hard dependency on `instrumentation.ts`
 * boot order.
 *
 * Failure mode: if the env var is missing, every call throws
 * `AppError(INTERNAL_ERROR)`. There is no plaintext fallback —
 * a misconfigured deploy must fail loud.
 */

import type { Adapter, AdapterAccount, AdapterUser } from 'next-auth/adapters';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { PrismaClient } from '@prisma/client';
import {
  encryptEnvelope,
  decryptEnvelope,
  loadEnvelopeKey,
} from '@/shared/crypto/envelope-encryption';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

type TokenField = 'refresh_token' | 'access_token' | 'id_token';
const TOKEN_FIELDS: readonly TokenField[] = ['refresh_token', 'access_token', 'id_token'] as const;

function readKey(): Uint8Array {
  return loadEnvelopeKey(process.env.OAUTH_TOKEN_ENCRYPTION_KEY);
}

/** Normalise PrismaAdapter's `void | T | null | undefined` returns to `T | null`. */
function stripUndefined<T>(value: T | null | undefined | void): T | null {
  return value ?? null;
}

export function createEncryptedPrismaAdapter(prismaClient: PrismaClient): Adapter {
  const base = PrismaAdapter(prismaClient);

  return {
    ...base,

    async linkAccount(rawAccount: AdapterAccount): Promise<AdapterAccount | null> {
      const key = readKey();
      // Spread into a loose map so we can replace the token fields
      // with the encrypted Buffer. The AdapterAccount type models
      // those fields as `string | null`, but the underlying Prisma
      // row accepts Bytes (Buffer/Uint8Array) and Auth.js's
      // getUserByAccount decrypts before returning.
      const account: Record<string, unknown> = { ...(rawAccount as Record<string, unknown>) };
      for (const field of TOKEN_FIELDS) {
        const plaintext = account[field];
        if (typeof plaintext === 'string' && plaintext.length > 0) {
          account[field] = await encryptEnvelope(plaintext, key);
        }
      }
      if (!base.linkAccount) {
        throw new Error(
          'EncryptedPrismaAdapter: underlying PrismaAdapter has no linkAccount method.',
        );
      }
      // Contract (file header): underlying base.linkAccount failures
      // (Prisma outage, network blip) must surface as AppError(INTERNAL_ERROR)
      // so the Auth.js callback sees a known, expected error class instead
      // of a raw `Error`. The env-var path is already wrapped in AppError
      // by `loadEnvelopeKey` (see `readKey()` above).
      let result: AdapterAccount | null;
      try {
        result = (await base.linkAccount(account as unknown as AdapterAccount)) ?? null;
      } catch (cause) {
        throw new AppError({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'EncryptedPrismaAdapter.linkAccount failed',
          cause,
        });
      }
      return stripUndefined(result);
    },

    async getUserByAccount(providerAccountId): Promise<AdapterUser | null> {
      // TODO(owner: future-doc-pass, issue #55): the file header
      // documents the env-var failure mode only; the Prisma-failure
      // contract is implied by the `linkAccount` precedent. Update
      // the header to make it explicit.
      let result: AdapterUser | null;
      try {
        // `base.getUserByAccount` is typed as optional; treat a
        // missing method as "no user" rather than crashing — the
        // Auth.js callback will see `null` and fall through to its
        // own "no linked account" branch.
        result = (await base.getUserByAccount?.(providerAccountId)) ?? null;
      } catch (cause) {
        throw new AppError({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'EncryptedPrismaAdapter.getUserByAccount failed',
          cause,
        });
      }
      if (!result) return null;
      // Re-fetch the account row to get the encrypted token columns
      // (the joined query only returns the User, not the Account).
      // The prisma client types Bytes? as `Buffer | null`; Buffer
      // extends Uint8Array, so the decrypt call works.
      let accountRow: {
        refresh_token: Buffer | Uint8Array | null;
        access_token: Buffer | Uint8Array | null;
        id_token: Buffer | Uint8Array | null;
      } | null;
      try {
        accountRow = await prismaClient.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: providerAccountId.provider,
              providerAccountId: providerAccountId.providerAccountId,
            },
          },
          select: {
            refresh_token: true,
            access_token: true,
            id_token: true,
          },
        });
      } catch (cause) {
        throw new AppError({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'EncryptedPrismaAdapter.getUserByAccount failed',
          cause,
        });
      }
      if (!accountRow) return result;
      const key = readKey();
      const decrypted: Partial<Record<TokenField, string | null>> = {};
      for (const field of TOKEN_FIELDS) {
        const buf = accountRow[field] as Buffer | Uint8Array | null | undefined;
        if (
          buf &&
          (buf instanceof Uint8Array || (buf as { length?: number }).length) &&
          buf.length > 0
        ) {
          decrypted[field] = await decryptEnvelope(buf as Uint8Array, key);
        } else if (buf === null) {
          decrypted[field] = null;
        }
      }
      return { ...result, ...decrypted } as AdapterUser;
    },
  };
}
