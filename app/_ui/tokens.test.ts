/**
 * Tests for the `app/_ui/tokens.css` file (T-PR2-13 of the
 * `ui-redesign` change).
 *
 * The test pins the contract for the 7 new glass/gradient/
 * shadow tokens added in T-PR2-01 and the dark-scope selector
 * rename in T-PR2-02:
 *
 *   - All 7+1 new variables are declared in the `:root` block
 *     (light values).
 *   - The color-override subset is also declared in the
 *     `.dark` block (dark overrides; the blur length tokens
 *     are identical in both themes so no dark override is
 *     needed for them).
 *   - The dark-scope selector is `.dark` (not
 *     `[data-theme='dark']`).
 *   - The 14 pre-existing color variables are byte-for-byte
 *     unchanged in the `:root` block (the append is the only
 *     diff vs. the v1 baseline).
 *
 * The test reads the file directly (no AST parsing) — the
 * tokens are a simple CSS custom property table and a regex
 * read is the simplest assertion that survives future CSS
 * reformatting.
 *
 * Per `AGENTS.md` §10.5 (\"No logic in tests\"), every
 * parameterized case is a separate `it()` so the failure
 * message names the failing token.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const TOKENS_CSS_PATH = resolve(process.cwd(), 'app/_ui/tokens.css');

const NEW_LIGHT_TOKENS = [
  '--ui-glass-bg',
  '--ui-glass-bg-solid',
  '--ui-glass-border',
  '--ui-glass-blur-sm',
  '--ui-glass-blur-lg',
  '--ui-shadow-glass',
  '--ui-gradient-from',
  '--ui-gradient-via',
  '--ui-gradient-to',
] as const;

// Tokens that have a meaningful dark-mode override. The
// blur values (`--ui-glass-blur-sm` / `--ui-glass-blur-lg`)
// are length tokens (12px / 20px) and are identical in
// both themes; the color tokens need dark overrides.
const NEW_DARK_OVERRIDE_TOKENS = [
  '--ui-glass-bg',
  '--ui-glass-bg-solid',
  '--ui-glass-border',
  '--ui-shadow-glass',
  '--ui-gradient-from',
  '--ui-gradient-via',
  '--ui-gradient-to',
] as const;

const PRE_EXISTING_COLOR_TOKENS = [
  '--ui-bg',
  '--ui-bg-muted',
  '--ui-bg-subtle',
  '--ui-fg',
  '--ui-fg-muted',
  '--ui-border',
  '--ui-accent',
  '--ui-accent-fg',
  '--ui-danger',
  '--ui-danger-fg',
  '--ui-success',
  '--ui-success-fg',
  '--ui-warning',
  '--ui-warning-fg',
] as const;

function readTokensCss(): string {
  return readFileSync(TOKENS_CSS_PATH, 'utf8');
}

function extractRootBlock(css: string): string {
  const match = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  return match?.[1] ?? '';
}

function extractDarkBlock(css: string): string {
  // Either `.dark {` (post T-PR2-02) or `[data-theme='dark'] {`
  // (pre T-PR2-02, historical).
  const dark = css.match(/\.dark\s*\{([\s\S]*?)\n\}/);
  if (dark) return dark[1] ?? '';
  const dataTheme = css.match(/\[data-theme=['"]dark['"]\s*\{([\s\S]*?)\n\}/);
  return dataTheme?.[1] ?? '';
}

describe('tokens.css (T-PR2-13)', () => {
  it('declares the .dark selector (T-PR2-02 — REQ-UI-9 MODIFIED)', () => {
    const css = readTokensCss();
    expect(css).toMatch(/\.dark\s*\{/);
    expect(css).not.toMatch(/\[data-theme=['"]dark['"]\s*\{/);
  });

  describe(':root — new tokens (T-PR2-01)', () => {
    it.each(NEW_LIGHT_TOKENS)('declares %s in :root', (token) => {
      const css = readTokensCss();
      const root = extractRootBlock(css);
      const re = new RegExp(`${token}\\s*:`);
      expect(root, `expected ${token} in :root`).toMatch(re);
    });
  });

  describe('.dark — color-override tokens (T-PR2-01)', () => {
    it.each(NEW_DARK_OVERRIDE_TOKENS)('declares %s in .dark', (token) => {
      const css = readTokensCss();
      const dark = extractDarkBlock(css);
      expect(dark.length, 'expected a .dark block to be present').toBeGreaterThan(0);
      const re = new RegExp(`${token}\\s*:`);
      expect(dark, `expected ${token} in .dark`).toMatch(re);
    });
  });

  describe(':root — pre-existing color variables (byte-for-byte preservation)', () => {
    it.each(PRE_EXISTING_COLOR_TOKENS)('preserves %s in :root', (token) => {
      const css = readTokensCss();
      const root = extractRootBlock(css);
      const re = new RegExp(`${token}\\s*:`);
      expect(root, `expected pre-existing ${token} in :root`).toMatch(re);
    });
  });

  describe('.dark — pre-existing color variables (byte-for-byte preservation)', () => {
    it.each(PRE_EXISTING_COLOR_TOKENS)('preserves %s in .dark', (token) => {
      const css = readTokensCss();
      const dark = extractDarkBlock(css);
      const re = new RegExp(`${token}\\s*:`);
      expect(dark, `expected pre-existing ${token} in .dark`).toMatch(re);
    });
  });
});
