import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
    // TEMP: The 2 test files below transitively import next-auth,
    // which imports `next/server` (no extension) from its ESM build.
    // Vite's strict ESM resolver can't resolve that path against
    // older next-auth betas (<5.0.0-beta.30) that predate the
    // extension-aware import. The bug closes ONLY when BOTH
    // conditions are met: (a) a next-auth beta that uses the
    // extension-aware import (>=5.0.0-beta.30), AND (b) a `next`
    // version that ships the `exports` field (>=15.2 or 16+).
    // (a) is delivered by chore/nextauth-beta30; (b) was delivered
    // by chore/next-16-cve. Once BOTH land on develop, revert the
    // entries below.
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'src/modules/auth/index.test.ts',
      'src/modules/auth/infrastructure/external/authjs.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      include: [
        'src/modules/auth/**',
        'src/shared/db/**',
        'src/shared/env/**',
        'src/shared/logger/**',
        'src/shared/http/**',
        'src/shared/errors/**',
        'src/shared/events/**',
        'src/shared/crypto/**',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
