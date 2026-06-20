/**
 * Auth.js v5 configuration (`authConfig`).
 *
 * Wires the Prisma adapter, the Google provider, and the
 * Credentials provider. The Credentials `authorize()`
 * function normalizes the email, looks the user up, and
 * runs an Argon2id verify. The `DUMMY_HASH` is generated
 * once at module init (top-level `const`) from the
 * `ARGON2ID_DUMMY_PASSWORD` env var; it equalizes timing
 * for the "user not found" / "no passwordHash" / "wrong
 * password" branches (BR-AUTH-4, BR-AUTH-9).
 *
 * The `signIn` callback stamps `lastLoginAt` on every
 * successful sign-in (best-effort — see `signInCallback`).
 * `defaultProvider` is NEVER mutated here (BR-AUTH-13). The
 * `session` callback adds `defaultProvider` and `lastLoginAt`
 * to the session JSON for `useSession()` clients.
 *
 * The destructured `{ handlers, auth, signIn, signOut }`
 * is the public surface of the auth module. Mounted at
 * `app/api/auth/[...nextauth]/route.ts` in Slice B.
 */

import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { createEncryptedPrismaAdapter } from '../adapters/encrypted-prisma-adapter';
import { z } from 'zod';

import { env } from '@/shared/env/env.schema';
import { prisma } from '@/shared/db/prisma';
import { Argon2idHasher } from './argon2.hasher';
import { logger } from '@/shared/logger/logger';
import { withRetry } from '@/shared/retry/with-retry';

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  // BR-AUTH-3 + BR-AUTH-9: minimum 10-char password at the server
  // boundary. The HTML `minLength={10}` on the signin form is a UX
  // hint; this Zod schema is the actual security boundary. The HTML
  // and the schema agree, so a client that bypasses the HTML
  // attribute (curl, fetch, modified browser) still hits a 10-char
  // minimum on the server.
  password: z.string().min(10).max(128),
});

/**
 * Fixed dummy hash used to equalize timing when the user is
 * not found or has no passwordHash (BR-AUTH-4, BR-AUTH-9).
 * Generated once at module init from `env.ARGON2ID_DUMMY_PASSWORD`,
 * which is a long random string set as a Fly secret and never
 * logged. The plaintext is irrelevant — the verify only
 * measures time, not content.
 *
 * We block the module's first import on the hash; the first
 * Credentials request is slower by ~50-100 ms as a result
 * (per the design's documented risk in §11). Subsequent
 * imports are cached and instant.
 */
let _dummyHashPromise: Promise<string> | undefined;
async function getDummyHash(): Promise<string> {
  if (!_dummyHashPromise) {
    _dummyHashPromise = new Argon2idHasher().hash(env.ARGON2ID_DUMMY_PASSWORD);
  }
  return _dummyHashPromise;
}
export const DUMMY_HASH: Promise<string> = getDummyHash();

/**
 * Normalize an email for DB lookup. Trim whitespace and lowercase.
 * Used by `authorize()` (registration / credential sign-in),
 * `registerAction`, and the `signIn` callback so the three call
 * sites cannot drift.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * `signIn` callback implementation, exported as a named function
 * for direct unit testing. Stamps `lastLoginAt` on every successful
 * sign-in (BR-AUTH-7 audit trail). Best-effort: we look up by
 * `email` (stable across provider and DB) instead of the wrong
 * `user.id` (which is the provider's `sub` in OAuth flows), use
 * `updateMany` so a missing row is a soft warning, and ALWAYS
 * return `true` so a tracking-write failure does not block an
 * already-successful authentication. Rationale + commit: `d20c8c3`.
 */
export async function signInCallback(params: {
  user?: { email?: string | null };
  clock?: { now: () => Date };
}): Promise<boolean> {
  const email = params.user?.email ? normalizeEmail(params.user.email) : null;
  if (!email) return true;
  const clock = params.clock ?? { now: () => new Date() };
  try {
    // withRetry gives the audit-trail write a chance to survive
    // transient Prisma outages (connection blip, brief failover,
    // lock wait). The policy is bounded: 3 attempts, exponential
    // backoff with 20% jitter. After 3 attempts the call falls
    // through to the catch-and-log branch (best-effort by design
    // — a tracking write must not block an already-successful
    // sign-in). The error is logged with the last attempt's
    // error message. Fixes 4R-R4 C-1 (withRetry was dead code).
    const result = await withRetry(
      () =>
        prisma().user.updateMany({
          where: { email },
          data: { lastLoginAt: clock.now() },
        }),
      {
        attempts: 3,
        baseDelayMs: 100,
        onRetry: (err: unknown, next: number, delayMs: number) =>
          logger.warn('signIn_callback_retry', {
            email,
            next,
            delayMs,
            error: err instanceof Error ? err.message : String(err),
          }),
      },
    );
    if (result.count === 0) {
      logger.warn('signIn_callback_user_not_found', { email });
    }
  } catch (err) {
    logger.error('signIn_callback_failed', {
      email,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return true;
}

export const authConfig: NextAuthConfig = {
  adapter: createEncryptedPrismaAdapter(prisma()),
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days, per BR-AUTH-7
    updateAge: 24 * 60 * 60, // sliding window 24h, per BR-AUTH-7
  },
  secret: env.AUTH_SECRET,
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
  },
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: 'select_account',
          scope: 'openid email profile',
        },
      },
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const normalizedEmail = normalizeEmail(email);

        const user = await prisma().user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true, name: true, image: true, passwordHash: true },
        });

        const hasher = new Argon2idHasher();
        const dummyHash = await DUMMY_HASH;

        // BR-AUTH-4 + BR-AUTH-9: equalize timing by running a verify
        // against the dummy hash on every "not-found" path.
        if (!user || !user.passwordHash) {
          await hasher.verify(dummyHash, password);
          return null;
        }

        const ok = await hasher.verify(user.passwordHash, password);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    signIn: signInCallback,
    async session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
        const dbUser = await prisma().user.findUnique({
          where: { id: user.id },
          select: { defaultProvider: true, lastLoginAt: true },
        });
        if (dbUser) {
          // The Auth.js Session type doesn't know about our custom
          // fields; we attach them via the same `user` object so
          // the client can read them through `useSession()`.
          Object.assign(session.user, {
            defaultProvider: dbUser.defaultProvider,
            lastLoginAt: dbUser.lastLoginAt ? dbUser.lastLoginAt.toISOString() : null,
          });
        }
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Pin the post-login redirect policy in this repo instead of
      // relying on Auth.js v5's default. Same-origin paths are
      // allowed (with protocol-relative URLs explicitly rejected);
      // external hosts are redirected to the baseUrl.
      if (url.startsWith('/') && !url.startsWith('//')) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // Malformed URL — fall through to baseUrl.
      }
      return baseUrl;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
