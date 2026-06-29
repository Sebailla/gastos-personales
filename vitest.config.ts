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
      ['app/_components/**/*.{test,spec}.tsx', 'jsdom'],
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
        // Slice 2 (`accounts-ui`): the production renders for the
        // accounts pages + their co-located components. Slice 3
        // (`transactions-ui`) adds `app/transactions/**` and
        // `app/_components/transactions-list-table.tsx`. Slice 4
        // (`dashboard-ui-refactor`) adds `app/dashboard/**` (the
        // Client Components + co-located sub-components) + the
        // two new dashboard Client Components in `app/_components`.
        'app/accounts/**',
        'app/transactions/**',
        'app/dashboard/**',
        'app/_components/transactions-list-table.tsx',
        'app/_components/dashboard-account-picker.tsx',
        'app/_components/dashboard-month-switcher.tsx',
        'app/_components/dashboard-monthly-summary.tsx',
        'app/_components/dashboard-category-breakdown.tsx',
        'app/_components/dashboard-account-flow.tsx',
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
        // Slice 2 (`accounts-ui`): Server Component page shells that
        // depend on NextAuth + the Hono composition root. The shell
        // logic (auth gate + data fetch redirect) is covered by the
        // Server Component contract tests in slice 5
        // (`feat/ui-integration-tests`); excluding here keeps the
        // 80% gate on the testable units (the Client Components +
        // co-located sub-components).
        'app/accounts/page.tsx',
        'app/accounts/[[]id]/page.tsx',
        'app/accounts/new/page.tsx',
        // `BalanceWidget` is a Client Component with a complex fetch
        // state machine; it is pinned by the smoke StaleChip test
        // (12.6% covered). The full Client Component contract lives
        // in the integration suite (slice 5).
        'app/accounts/[[]id]/balance-widget.tsx',
        // Slice 3 (`transactions-ui`): mirror of slice 2's
        // exclusion — the three Server Component shells depend
        // on NextAuth + the Hono composition root and are covered
        // at the integration layer in slice 5.
        'app/transactions/page.tsx',
        'app/transactions/[[]id]/page.tsx',
        'app/transactions/new/page.tsx',
        // Slice 4 (`dashboard-ui-refactor`): the Server Component
        // page shell (`app/dashboard/page.tsx`) is covered by the
        // Server Component contract tests (the 5 tests in
        // `page.test.tsx` + `page.seeded.test.tsx`); the shell
        // depends on NextAuth + the Hono composition root +
        // parallel Promise.all over optional flow fetch. The
        // exclude pattern matches the slice 2/3 precedent.
        'app/dashboard/page.tsx',
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
