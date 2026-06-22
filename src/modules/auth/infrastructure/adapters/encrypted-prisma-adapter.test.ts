/**
 * Tests for `EncryptedPrismaAdapter`.
 *
 * Goal: lift `encrypted-prisma-adapter.ts` from 20% to >= 80% functions
 * coverage, and the auth module's `infrastructure/adapters/**` folder
 * from 20% to >= 80%. The adapter is a thin wrapper over
 * `@auth/prisma-adapter` that adds token-field encryption on the two
 * methods that touch the `Account.token*` columns (`linkAccount` and
 * `getUserByAccount`). The non-overridden methods delegate unchanged
 * — their behaviour is covered by the upstream integration tests in CI
 * (see `app/api/auth/[...nextauth]/route.test.ts`).
 *
 * Strategy: mock `@auth/prisma-adapter` so we don't exercise its
 * internals, and construct a minimal `prismaClient` mock with just
 * the `account.findUnique` surface the read-path needs. Use the real
 * `loadEnvelopeKey` / `encryptEnvelope` / `decryptEnvelope` from
 * `@/shared/crypto/envelope-encryption` — those are covered by their
 * own test file (`envelope-encryption.test.ts`), and our contract is
 * precisely "wrap them correctly".
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdapterAccount, AdapterUser } from 'next-auth/adapters';

// Mocks MUST be declared before the import of the module under test.
const prismaAdapterMock = vi.hoisted(() => {
  // The real `PrismaAdapter(prisma)` returns an `Adapter` with every
  // method. We only need to override the two methods the encrypted
  // wrapper overrides; the rest delegate via spread (`...base`).
  const linkAccount = vi.fn();
  const getUserByAccount = vi.fn();
  const noop = vi.fn();
  return {
    linkAccount,
    getUserByAccount,
    noop,
    base: {
      createUser: noop,
      getUser: noop,
      getUserByEmail: noop,
      updateUser: noop,
      deleteUser: noop,
      linkAccount,
      unlinkAccount: noop,
      createSession: noop,
      getSessionAndUser: noop,
      updateSession: noop,
      deleteSession: noop,
      createVerificationToken: noop,
      useVerificationToken: noop,
      getUserByAccount,
    },
  };
});

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: () => prismaAdapterMock.base,
}));

import { createEncryptedPrismaAdapter } from './encrypted-prisma-adapter';
import { AppError } from '@/shared/errors/app-error';

// 32-byte key encoded as 64 hex chars. Real keys live in Fly secrets.
const TEST_KEY_HEX = 'a'.repeat(64);

beforeAll(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = TEST_KEY_HEX;
});

const buildAccountRow = (overrides: Partial<AdapterAccount> = {}): AdapterAccount => ({
  userId: 'u-1',
  type: 'oauth',
  provider: 'google',
  providerAccountId: 'google-123',
  refresh_token: undefined,
  access_token: undefined,
  expires_at: undefined,
  token_type: undefined,
  scope: undefined,
  id_token: undefined,
  session_state: undefined,
  ...overrides,
});

const buildUser = (overrides: Partial<AdapterUser> = {}): AdapterUser => ({
  id: 'u-1',
  email: 'alice@example.com',
  emailVerified: null,
  name: 'Alice',
  image: null,
  ...overrides,
});

const buildPrismaClient = (
  accountRow?: {
    refresh_token: Buffer | null;
    access_token: Buffer | null;
    id_token: Buffer | null;
  } | null,
) => {
  const findUnique = vi.fn().mockResolvedValue(accountRow);
  const account = { findUnique };
  const user = { findUnique: vi.fn() };
  return { client: { account, user } as never, findUnique, account, user };
};

beforeEach(() => {
  prismaAdapterMock.linkAccount.mockReset();
  prismaAdapterMock.getUserByAccount.mockReset();
  prismaAdapterMock.noop.mockReset();
});

describe('createEncryptedPrismaAdapter — composition', () => {
  it('delegates non-overridden methods (getUser, getUserByEmail, …) to the underlying PrismaAdapter', () => {
    const { client } = buildPrismaClient();
    const adapter = createEncryptedPrismaAdapter(client);

    // The wrapper spreads `...base` so every method the underlying
    // adapter exposes must be present on the returned object and
    // reference-identical to the base. This is the contract that
    // lets us re-implement only the two token-touching methods.
    expect(adapter.createUser).toBe(prismaAdapterMock.base.createUser);
    expect(adapter.getUser).toBe(prismaAdapterMock.base.getUser);
    expect(adapter.getUserByEmail).toBe(prismaAdapterMock.base.getUserByEmail);
    expect(adapter.updateUser).toBe(prismaAdapterMock.base.updateUser);
    expect(adapter.deleteUser).toBe(prismaAdapterMock.base.deleteUser);
    expect(adapter.unlinkAccount).toBe(prismaAdapterMock.base.unlinkAccount);
    expect(adapter.createSession).toBe(prismaAdapterMock.base.createSession);
    expect(adapter.getSessionAndUser).toBe(prismaAdapterMock.base.getSessionAndUser);
    expect(adapter.updateSession).toBe(prismaAdapterMock.base.updateSession);
    expect(adapter.deleteSession).toBe(prismaAdapterMock.base.deleteSession);
    expect(adapter.createVerificationToken).toBe(prismaAdapterMock.base.createVerificationToken);
    expect(adapter.useVerificationToken).toBe(prismaAdapterMock.base.useVerificationToken);
  });
});

describe('createEncryptedPrismaAdapter.linkAccount', () => {
  it('encrypts refresh_token, access_token, and id_token before delegating to the underlying PrismaAdapter', async () => {
    const { client } = buildPrismaClient();
    const adapter = createEncryptedPrismaAdapter(client);
    prismaAdapterMock.linkAccount.mockResolvedValue({ providerAccountId: 'google-123' });

    const account = buildAccountRow({
      refresh_token: 'refresh-plaintext',
      access_token: 'access-plaintext',
      id_token: 'id-plaintext',
    });
    await adapter.linkAccount!(account);

    expect(prismaAdapterMock.linkAccount).toHaveBeenCalledTimes(1);
    const passedToBase = prismaAdapterMock.linkAccount.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    // The token fields reaching Prisma must be Uint8Array (encrypted
    // bytes), not the plaintext strings. Length > 0 because the
    // envelope includes IV + ciphertext + tag.
    expect(passedToBase['refresh_token']).toBeInstanceOf(Uint8Array);
    expect((passedToBase['refresh_token'] as Uint8Array).length).toBeGreaterThan(0);
    expect(passedToBase['access_token']).toBeInstanceOf(Uint8Array);
    expect((passedToBase['access_token'] as Uint8Array).length).toBeGreaterThan(0);
    expect(passedToBase['id_token']).toBeInstanceOf(Uint8Array);
    expect((passedToBase['id_token'] as Uint8Array).length).toBeGreaterThan(0);
    // Non-token fields pass through untouched.
    expect(passedToBase['provider']).toBe('google');
    expect(passedToBase['providerAccountId']).toBe('google-123');
  });

  it('skips encryption when token fields are null (Prisma stores them as Bytes?)', async () => {
    const { client } = buildPrismaClient();
    const adapter = createEncryptedPrismaAdapter(client);
    prismaAdapterMock.linkAccount.mockResolvedValue({ providerAccountId: 'google-123' });

    // `AdapterAccount` types the token fields as `string | undefined`.
    // We simulate "no token" by omitting the fields (undefined). The
    // spread in the wrapper preserves undefined for non-string fields.
    const account = buildAccountRow({
      refresh_token: undefined,
      access_token: undefined,
      id_token: undefined,
    });
    await adapter.linkAccount!(account);

    const passedToBase = prismaAdapterMock.linkAccount.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    // The wrapper spreads the account and only replaces non-empty
    // strings. Non-string fields (undefined) are not encrypted.
    expect(passedToBase['refresh_token']).toBeUndefined();
    expect(passedToBase['access_token']).toBeUndefined();
    expect(passedToBase['id_token']).toBeUndefined();
  });

  it('skips encryption when token fields are empty strings', async () => {
    const { client } = buildPrismaClient();
    const adapter = createEncryptedPrismaAdapter(client);
    prismaAdapterMock.linkAccount.mockResolvedValue({ providerAccountId: 'google-123' });

    const account = buildAccountRow({
      refresh_token: '',
      access_token: '',
      id_token: '',
    });
    await adapter.linkAccount!(account);

    const passedToBase = prismaAdapterMock.linkAccount.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    // Empty-string is treated as "no token" and passed through.
    expect(passedToBase['refresh_token']).toBe('');
    expect(passedToBase['access_token']).toBe('');
    expect(passedToBase['id_token']).toBe('');
  });

  it('returns the underlying adapter result (including null) on success', async () => {
    const { client } = buildPrismaClient();
    const adapter = createEncryptedPrismaAdapter(client);
    prismaAdapterMock.linkAccount.mockResolvedValue(null);

    const result = await adapter.linkAccount!(buildAccountRow());
    expect(result).toBeNull();
  });

  it('propagates the underlying linkAccount error (no try/catch — flagged in PR body)', async () => {
    // NOTE: the production `linkAccount` does NOT wrap `base.linkAccount`
    // in try/catch. A prisma outage during linkAccount surfaces as a
    // raw `Error` to the Auth.js callback, not as `AppError(INTERNAL_ERROR)`.
    // The contract documentation (file header) says "throws AppError(INTERNAL_ERROR)
    // if the underlying base.linkAccount throws", so this is a documented-vs-implemented
    // drift. We're flagging it in the PR body and leaving the fix to a follow-up
    // change (scope creep to fix here).
    const { client } = buildPrismaClient();
    const adapter = createEncryptedPrismaAdapter(client);
    prismaAdapterMock.linkAccount.mockRejectedValue(new Error('prisma is down'));

    await expect(adapter.linkAccount!(buildAccountRow({ refresh_token: 'tok' }))).rejects.toThrow(
      'prisma is down',
    );
    // Confirm it is NOT wrapped as AppError today.
    await expect(
      adapter.linkAccount!(buildAccountRow({ refresh_token: 'tok' })),
    ).rejects.not.toBeInstanceOf(AppError);
  });

  it('throws AppError(INTERNAL_ERROR) if OAUTH_TOKEN_ENCRYPTION_KEY is missing', async () => {
    const { client } = buildPrismaClient();
    const adapter = createEncryptedPrismaAdapter(client);

    const saved = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    try {
      await expect(
        adapter.linkAccount!(buildAccountRow({ refresh_token: 'tok' })),
      ).rejects.toBeInstanceOf(AppError);
      // The underlying adapter must not be called when the key is
      // missing — there is no plaintext fallback by design.
      expect(prismaAdapterMock.linkAccount).not.toHaveBeenCalled();
    } finally {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = saved;
    }
  });
});

describe('createEncryptedPrismaAdapter — defensive guard', () => {
  it('throws a plain Error if the underlying adapter has no linkAccount method (programmer error)', async () => {
    // Save the original linkAccount so we can restore it after this
    // one-off check. The production guard at lines 72-74 is meant to
    // trip only if someone passes a hand-rolled base adapter without
    // linkAccount — a programmer error, not a runtime path.
    const original = prismaAdapterMock.base.linkAccount;
    // @ts-expect-error: deliberately remove linkAccount to exercise the guard
    delete prismaAdapterMock.base.linkAccount;

    try {
      const { client } = buildPrismaClient();
      const adapter = createEncryptedPrismaAdapter(client);

      await expect(adapter.linkAccount!(buildAccountRow({ refresh_token: 'tok' }))).rejects.toThrow(
        /no linkAccount method/i,
      );
    } finally {
      prismaAdapterMock.base.linkAccount = original;
    }
  });
});

describe('createEncryptedPrismaAdapter.getUserByAccount', () => {
  it('returns null without querying the account row when the base adapter returns null', async () => {
    const { client, findUnique } = buildPrismaClient();
    const adapter = createEncryptedPrismaAdapter(client);
    prismaAdapterMock.getUserByAccount.mockResolvedValue(null);

    const result = await adapter.getUserByAccount!({
      provider: 'google',
      providerAccountId: 'g-1',
    });
    expect(result).toBeNull();
    // Short-circuit: don't hit the DB for tokens if the user lookup
    // already missed.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns the user unchanged when the base adapter returns a user but the account row is missing', async () => {
    const { client, findUnique } = buildPrismaClient(null);
    const adapter = createEncryptedPrismaAdapter(client);
    const baseUser = buildUser();
    prismaAdapterMock.getUserByAccount.mockResolvedValue(baseUser);

    const result = await adapter.getUserByAccount!({
      provider: 'google',
      providerAccountId: 'g-2',
    });
    expect(result).toEqual(baseUser);
    // We DID issue the account lookup (because the base had a user),
    // but no token decryption was attempted because the row is gone.
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('decrypts refresh_token, access_token, and id_token from the account row before returning the user', async () => {
    const { client, findUnique } = buildPrismaClient(null);
    const adapter = createEncryptedPrismaAdapter(client);
    const baseUser = buildUser();
    prismaAdapterMock.getUserByAccount.mockResolvedValue(baseUser);

    // We need real ciphertext bytes (encrypt with the test key, then
    // pass them through the adapter as if read from the DB).
    const { encryptEnvelope, loadEnvelopeKey } = await import(
      '@/shared/crypto/envelope-encryption'
    );
    const key = loadEnvelopeKey(process.env.OAUTH_TOKEN_ENCRYPTION_KEY);
    const refresh = await encryptEnvelope('refresh-plain', key);
    const access = await encryptEnvelope('access-plain', key);
    const idTok = await encryptEnvelope('id-plain', key);

    // Re-mock with ciphertext bytes after the fact.
    findUnique.mockResolvedValue({
      refresh_token: Buffer.from(refresh),
      access_token: Buffer.from(access),
      id_token: Buffer.from(idTok),
    });

    const result = (await adapter.getUserByAccount!({
      provider: 'google',
      providerAccountId: 'g-3',
    })) as AdapterUser & { refresh_token: string; access_token: string; id_token: string };

    // The adapter surfaces the decrypted plaintext back to the caller.
    expect(result.refresh_token).toBe('refresh-plain');
    expect(result.access_token).toBe('access-plain');
    expect(result.id_token).toBe('id-plain');
    // The base user fields pass through unchanged.
    expect(result.id).toBe(baseUser.id);
    expect(result.email).toBe(baseUser.email);
  });

  it('attaches null token fields when the account row has null token columns (no decryption error)', async () => {
    const { client } = buildPrismaClient({
      refresh_token: null,
      access_token: null,
      id_token: null,
    });
    const adapter = createEncryptedPrismaAdapter(client);
    const baseUser = buildUser();
    prismaAdapterMock.getUserByAccount.mockResolvedValue(baseUser);

    // The adapter spreads `{...result, ...decrypted}` where `decrypted`
    // is `{ refresh_token: null, access_token: null, id_token: null }`.
    // Net effect: the returned object carries the user fields + the
    // three null token fields. This is the documented behaviour and
    // is what Auth.js's Credentials `authorize()` path observes.
    const result = await adapter.getUserByAccount!({
      provider: 'google',
      providerAccountId: 'g-4',
    });
    expect(result).toMatchObject({
      id: baseUser.id,
      email: baseUser.email,
      refresh_token: null,
      access_token: null,
      id_token: null,
    });
  });

  it('throws AppError(INTERNAL_ERROR) if loadEnvelopeKey throws on the read path', async () => {
    // The read path hits `readKey()` after the account row lookup
    // succeeds and before the decrypt loop. Force the key to be
    // missing so `loadEnvelopeKey` throws.
    const { client } = buildPrismaClient({
      refresh_token: Buffer.alloc(64),
      access_token: Buffer.alloc(64),
      id_token: Buffer.alloc(64),
    });
    const adapter = createEncryptedPrismaAdapter(client);
    prismaAdapterMock.getUserByAccount.mockResolvedValue(buildUser());

    const saved = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    try {
      await expect(
        adapter.getUserByAccount!({ provider: 'google', providerAccountId: 'g-5' }),
      ).rejects.toBeInstanceOf(AppError);
    } finally {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = saved;
    }
  });
});
