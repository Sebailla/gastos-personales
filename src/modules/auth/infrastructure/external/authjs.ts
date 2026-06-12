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
 * successful sign-in. `defaultProvider` is NEVER mutated
 * here (BR-AUTH-13). The `session` callback adds
 * `defaultProvider` and `lastLoginAt` to the session
 * JSON for `useSession()` clients.
 *
 * The destructured `{ handlers, auth, signIn, signOut }`
 * is the public surface of the auth module. Mounted at
 * `app/api/auth/[...nextauth]/route.ts` in Slice B.
 */

import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { z } from 'zod';

import { env } from '@/shared/env/env.schema';
import { prisma } from '@/shared/db/prisma';
import {
  hashArgon2id,
  verifyArgon2id,
} from '@/modules/auth/infrastructure/external/argon2.hasher';
import { logger } from '@/shared/logger/logger';

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

/**
 * Fixed dummy hash used to equalize timing when the user is
 * not found or has no passwordHash (BR-AUTH-4, BR-AUTH-9).
 * Generated once at module init from `env.ARGON2ID_DUMMY_PASSWORD`,
 * which is a long random string set as a Fly secret and never
 * logged. The plaintext is irrelevant — the verify only
 * measures time, not content.
 */
export const DUMMY_HASH: string = hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD);

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma()),
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
        const normalizedEmail = email.trim().toLowerCase();

        const user = await prisma().user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true, name: true, image: true, passwordHash: true },
        });

        // BR-AUTH-4 + BR-AUTH-9: equalize timing by running a verify
        // against the dummy hash on every "not-found" path.
        if (!user || !user.passwordHash) {
          await verifyArgon2id(DUMMY_HASH, password);
          return null;
        }

        const ok = await verifyArgon2id(user.passwordHash, password);
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
    async signIn({ user }) {
      if (!user?.id) return false;
      try {
        await prisma().user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      } catch (err) {
        logger.error('signIn_callback_failed', {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
      return true;
    },
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
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
