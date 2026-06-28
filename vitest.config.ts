import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts', './test/axe-setup.ts'],
    include: [
      'src/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.ts',
      'app/**/*.{test,spec}.{ts,tsx}',
      'proxy.{test,spec}.ts',
    ],
    exclude: ['node_modules', 'dist', '.next'],
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
        // Pure type interfaces (ports): contracts, no executable code.
        'src/modules/**/domain/interfaces/**/*.ts',
        // Barrel re-exports: pure imports + exports, no logic.
        'src/**/index.ts',
        // Event type definitions: pure state, dispatched by infrastructure.
        'src/shared/events/user-events.ts',
        // _ui/index.ts is a documentation-only barrel.
        'app/_ui/index.ts',
        // _ui/tokens.css is a pure CSS asset.
        'app/_ui/**/*.css',
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
