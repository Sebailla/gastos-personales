// ESLint v9 flat config — replaces legacy .eslintrc.cjs.
// Granular form: uses @typescript-eslint/parser and
// @typescript-eslint/eslint-plugin directly. No umbrella
// `typescript-eslint` dep added on purpose (smaller diff).
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';

// Helper: pick a config object from the plugin and translate its
// legacy `overrides` shape into a flat config entry. The plugin
// still exports configs in legacy format (parser/plugins keys,
// overrides[].files) so we adapt by hand.
function tsConfig(name) {
  const cfg = tsPlugin.configs[name];
  const files = cfg.overrides?.[0]?.files ?? ['**/*.{ts,tsx,mts,cts}'];
  const rules = {
    ...(cfg.overrides?.[0]?.rules ?? {}),
    ...(cfg.rules ?? {}),
  };
  return {
    files,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules,
  };
}

export default [
  {
    // Mirrors legacy `ignorePatterns`.
    ignores: [
      'node_modules/',
      '.next/',
      'dist/',
      'coverage/',
      '*.config.js',
      '*.config.cjs',
      '*.config.mjs',
    ],
  },
  // Type-checked JS (eslint:recommended turned off where TS rules supersede).
  tsConfig('eslint-recommended'),
  // TS recommended ruleset on top.
  tsConfig('recommended'),
  // Project custom rules.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Disable return-type enforcement in test files (legacy `overrides`).
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  // Prettier must come last so it can turn off conflicting stylistic rules.
  prettierConfig,
];