// Vitest setup. Loads environment variables for the test suite
// and wires any global mocks (e.g. a fake Prisma client for
// unit tests that don't need a real database).

// Provide deterministic env vars so the Zod env schema can
// parse in unit tests. Integration tests that need a real
// database override these via testcontainers.
const setIfMissing = (key: string, value: string): void => {
  if (process.env[key] === undefined) {
    Object.defineProperty(process.env, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }
};

setIfMissing('NODE_ENV', 'test');
setIfMissing('LOG_LEVEL', 'error');
setIfMissing('DATABASE_URL', 'postgresql://test:test@localhost:5432/gastos_test');
setIfMissing('AUTH_SECRET', 'ci-only-secret-32-bytes-min-padding');
setIfMissing('AUTH_URL', 'http://localhost:3000');
setIfMissing('APP_URL', 'http://localhost:3000');
setIfMissing('AUTH_GOOGLE_ID', 'ci-google-id');
setIfMissing('AUTH_GOOGLE_SECRET', 'ci-google-secret');
setIfMissing('ARGON2ID_DUMMY_PASSWORD', 'ci-dummy-password-32-bytes-min-padding');
