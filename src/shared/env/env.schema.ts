import { z } from 'zod';

/**
 * Environment schema for `gastos-personales`.
 *
 * Validated at startup. Any missing or malformed value fails
 * fast with a clear Zod error. The cross-field check at the
 * bottom asserts that `AUTH_URL` and `APP_URL` share the same
 * origin — a mismatch is the most common "OAuth works in dev
 * but fails in prod" misconfiguration.
 *
 * See `design.md` §7 for the full spec.
 */
export const envSchema = z
  .object({
    // --- Runtime ---
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // --- Database ---
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // --- Auth.js v5 ---
    AUTH_SECRET: z
      .string()
      .min(32, 'AUTH_SECRET must be at least 32 bytes (use `openssl rand -base64 32`)'),
    AUTH_URL: z.string().url().default('http://localhost:3000'),
    APP_URL: z.string().url().default('http://localhost:3000'),

    // --- Google provider ---
    AUTH_GOOGLE_ID: z.string().min(1, 'AUTH_GOOGLE_ID is required'),
    AUTH_GOOGLE_SECRET: z.string().min(1, 'AUTH_GOOGLE_SECRET is required'),

    // --- Argon2id ---
    ARGON2ID_DUMMY_PASSWORD: z
      .string()
      .min(32, 'ARGON2ID_DUMMY_PASSWORD must be at least 32 bytes'),

    // --- OAuth token encryption (4R-R1) ---
    // 64 hex characters = 32 raw bytes for AES-256-GCM. Generate
    // with `openssl rand -hex 32` and set as a Fly secret. Optional
    // in dev: tests that exercise non-Account paths work without
    // it. Required in production: the Auth.js v5 adapter throws
    // AppError(INTERNAL_ERROR) on every Account-touching call if
    // the key is missing or malformed.
    OAUTH_TOKEN_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'OAUTH_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
      .optional(),

    // --- Fly.io (optional) ---
    FLY_REGION: z.string().optional(),

    // --- Sentry (optional, observability) ---
    // Server-side DSN is read from `SENTRY_DSN` (e.g. set as a Fly
    // secret). The client-side equivalent is `NEXT_PUBLIC_SENTRY_DSN`
    // (inlined into the browser bundle). Both are optional: when
    // absent, `src/shared/logger/logger.ts` keeps using console.*
    // and the Sentry SDK is never initialised by
    // `sentry.{server,client}.config.ts`.
    SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Cross-field: AUTH_URL and APP_URL must share the same origin.
    try {
      const authOrigin = new URL(data.AUTH_URL).origin;
      const appOrigin = new URL(data.APP_URL).origin;
      if (authOrigin !== appOrigin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_URL'],
          message: `APP_URL origin (${appOrigin}) must match AUTH_URL origin (${authOrigin})`,
        });
      }
    } catch {
      // Per-field .url() already catches malformed URLs; this branch
      // is a defense-in-depth no-op.
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validated environment object. Read this in every module; never
 * reach for `process.env` directly (per `env-config` skill).
 */
export const env: Env = envSchema.parse(process.env);
