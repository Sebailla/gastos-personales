import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    // Node environment for non-component tests (src/modules, test/, proxy).
    environment: 'node',
    setupFiles: ['./test/setup.ts', './test/axe-setup.ts'],
    include: [
      'src/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.ts',
      'app/**/*.{test,spec}.{ts,tsx}',
      'proxy.{test,spec}.ts',
    ],
    exclude: ['node_modules', 'dist', '.next'],
    // App-router React component tests need a DOM. Configure per-file
    // with `// @vitest-environment jsdom` so non-component tests stay
    // on the Node environment (faster, no jsdom bootstrap).
    environmentMatchGlobs: [
      ['app/_ui/**/*.{test,spec}.tsx', 'jsdom'],
      ['app/accounts/**/*.{test,spec}.tsx', 'jsdom'],
      ['app/transactions/**/*.{test,spec}.tsx', 'jsdom'],
      ['app/dashboard/**/*.{test,spec}.tsx', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      include: [
        'src/modules/auth/**',
        'src/modules/accounts/**',
        'src/modules/fx/**',
        'src/modules/reports/**',
        'src/shared/db/**',
        'src/shared/env/**',
        'src/shared/logger/**',
        'src/shared/http/**',
        'src/shared/errors/**',
        'src/shared/events/**',
        'src/shared/crypto/**',
        'app/_ui/**',
      ],
      exclude: [
        'src/modules/**/domain/interfaces/**/*.ts',
        'src/**/index.ts',
        'src/shared/events/user-events.ts',
        'app/_ui/index.ts',
        'app/_ui/**/*.css',
        // Forward-declared per design §2.1; NOT used in v1. Follow-up
        // changes will exercise them.
        'app/_ui/layout/sidebar.tsx',
        'app/_ui/layout/topbar.tsx',
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
