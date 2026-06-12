// Vitest setup. Loads environment variables for the test suite
// and wires any global mocks (e.g. a fake Prisma client for
// unit tests that don't need a real database).

// Provide deterministic env vars so the Zod env schema can
// parse in unit tests. Integration tests that need a real
// database override these via testcontainers.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/gastos_test';
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET ?? 'ci-only-secret-32-bytes-min-padding';
process.env.AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3000';
process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
process.env.AUTH_GOOGLE_ID = process.env.AUTH_GOOGLE_ID ?? 'ci-google-id';
process.env.AUTH_GOOGLE_SECRET = process.env.AUTH_GOOGLE_SECRET ?? 'ci-google-secret';
process.env.ARGON2ID_DUMMY_PASSWORD =
  process.env.ARGON2ID_DUMMY_PASSWORD ?? 'ci-dummy-password-32-bytes-min-padding';
