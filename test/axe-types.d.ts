/**
 * Type augmentation for vitest-axe matchers.
 *
 * The vitest-axe package ships a `.d.ts` that augments the
 * `Vi.Assertion` interface via `import 'vitest-axe/extend-expect'`,
 * but that import path resolves to an empty file in v0.1.0 of
 * the package. We re-augment the interface here so the
 * `toHaveNoViolations` matcher is visible to TypeScript.
 */

import 'vitest-axe';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): unknown;
  }
}

export {};
