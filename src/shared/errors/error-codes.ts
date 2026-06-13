/**
 * Exhaustive list of error codes the application can emit.
 * Each code maps to a stable HTTP status (see `app-error.ts`).
 * Codes marked with a doc comment are produced by Auth.js and
 * surfaced on the signIn page; the rest are produced by our
 * application code.
 *
 * Adding a new code is a non-breaking change for callers that
 * match on the message text. Existing codes MUST keep their
 * HTTP status and machine-readable value.
 */
export const ErrorCode = {
  // --- Validation (400) ---
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  WEAK_PASSWORD: 'WEAK_PASSWORD',

  // --- Auth (401) ---
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // --- Authz (403) ---
  FORBIDDEN: 'FORBIDDEN',

  // --- Conflict (409) ---
  EMAIL_TAKEN: 'EMAIL_TAKEN',

  // --- Rate (429) ---
  RATE_LIMITED: 'RATE_LIMITED',

  // --- Upstream (502) ---
  OAUTH_PROVIDER_UNAVAILABLE: 'OAUTH_PROVIDER_UNAVAILABLE',

  // --- Catch-all (500) ---
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * HTTP status for each error code. Centralized here so the
 * error-handler middleware and the test suite can read from
 * a single source of truth.
 */
export const ErrorStatus: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  WEAK_PASSWORD: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  EMAIL_TAKEN: 409,
  RATE_LIMITED: 429,
  OAUTH_PROVIDER_UNAVAILABLE: 502,
  INTERNAL_ERROR: 500,
};
