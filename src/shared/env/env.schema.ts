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

    // --- Fly.io (optional) ---
    FLY_REGION: z.string().optional(),
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
