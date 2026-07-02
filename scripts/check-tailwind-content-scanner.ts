/**
 * scripts/check-tailwind-content-scanner.ts
 *
 * Detects Tailwind v4 content-scanner hazards in source files.
 *
 * Tailwind v4 scans all .ts/.tsx/.md/.mdx files under its content globs
 * and extracts anything that looks like a utility class. Brace-expansion
 * tokens (e.g. `bg-ui-glass-{1,2}`) are NOT valid CSS, but the scanner
 * picks them up and emits them into the generated CSS, which then crashes
 * PostCSS at build time (HTTP 500 on dev server, broken /es route).
 *
 * This script greps for brace-expansion patterns that look like utility
 * classes and fails with exit code 1 if any are found outside the
 * allowlist fixture.
 *
 * Why this is a hazard (recurring bug class, see PR #113):
 *   1. Tailwind's content scanner extracts the brace-expansion token as
 *      if it were a real class.
 *   2. PostCSS sees the emitted CSS, tries to parse `bg-ui-glass-{1,2}`
 *      as a CSS value, and fails: "Unexpected token CurlyBracketBlock".
 *   3. The build still completes (warning, not error) and the dev server
 *      returns HTTP 500 on the affected route (/es in the original
 *      incident).
 *
 * Fix in code: rewrite the class literal as a prose enumeration or two
 * literal class names. Example:
 *   BAD:  `bg-ui-glass-{1,2}` + `backdrop-blur-[var(--ui-glass-blur-{sm,lg})]`
 *   GOOD: `bg-ui-glass-1` (or `bg-ui-glass-2`) + `backdrop-blur-[var(--ui-glass-blur-sm)]` (or `-[lg]`)
 *
 * Run via:
 *   pnpm run check:tailwind-scanner
 *
 * Wired into:
 *   - CI: .github/workflows/ci.yml (lint job)
 *   - Pre-commit: .husky/pre-commit (after lockfile check, before lint-staged)
 *
 * Exit codes:
 *   0 — no hazards found.
 *   1 — one or more hazards found (with file:line:match list on stderr).
 *   2 — unexpected failure (full stack trace on stderr).
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// Directories to scan (additive; defaults are conservative).
const SCAN_DIRS = ['app', 'docs', 'Documents-es', 'scripts'];

// File extensions to include.
const SCAN_EXTS = ['.ts', '.tsx', '.md', '.mdx'];

// Directories to always skip (in addition to node_modules and dotfiles).
// `__tests__` is excluded so that test fixtures used to validate the
// scanner itself (e.g. `scripts/__tests__/check-tailwind-content-scanner.test.ts`
// which contains literal `foo-{a,b}` strings as test cases) do not
// produce self-referential violations.
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'coverage',
  'dist',
  'out',
  '__tests__',
]);

// Brace-expansion pattern that matches a utility-class-looking token.
// Supports chained brace blocks (`text-{red,blue}-{500,600}`) so the
// full hazard is reported in a single match.
// Examples that match:
//   bg-ui-glass-{1,2}
//   backdrop-blur-[var(--ui-glass-blur-{sm,lg})]  -> captures blur-{sm,lg}
//   text-{red,blue}-{500,600}                     -> captures text-{red,blue}-{500,600}
//
// Examples that do NOT match:
//   bg-ui-glass-1
//   bg-ui-glass-{1,2}-md   (the trailing -md breaks the match)
const PATTERN = /[a-z][a-z0-9]*(-[a-z0-9]+)*-\{[a-z0-9_,\-]+\}(-\{[a-z0-9_,\-]+\})*/g;

// Allowlist fixture path.
const ALLOWLIST_PATH = resolve(__dirname, '__fixtures__', 'tailwind-scanner-allowlist.txt');

/**
 * Extract all brace-expansion matches from a file's content.
 *
 * Exported for unit testing.
 */
export function extractMatches(content: string): string[] {
  const matches: string[] = [];
  for (const m of content.matchAll(PATTERN)) {
    matches.push(m[0]);
  }
  return matches;
}

/**
 * Load the allowlist fixture as a Set of allowed match strings.
 * Lines starting with `#` and blank lines are ignored.
 *
 * Exported for unit testing.
 */
export async function loadAllowlist(path: string = ALLOWLIST_PATH): Promise<Set<string>> {
  try {
    const content = await readFile(path, 'utf8');
    return new Set(
      content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#')),
    );
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw err;
  }
}

/**
 * Walk a directory recursively, yielding absolute file paths that match
 * the SCAN_EXTS list.
 *
 * Exported for unit testing.
 */
export async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      if (SCAN_EXTS.some((ext) => entry.name.endsWith(ext))) {
        yield full;
      }
    }
  }
}

export interface Violation {
  file: string;
  line: number;
  match: string;
  context: string;
}

/**
 * Scan all SCAN_DIRS and return any violations found.
 *
 * Exported for unit testing.
 */
export async function scan(allowlist: Set<string>): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const dir of SCAN_DIRS) {
    const absDir = resolve(ROOT, dir);
    for await (const file of walk(absDir)) {
      // Skip self (this file contains the PATTERN constant literally).
      if (file === __filename) continue;
      const content = await readFile(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const matches = extractMatches(line);
        for (const match of matches) {
          if (allowlist.has(match)) continue;
          violations.push({
            file: relative(ROOT, file),
            line: idx + 1,
            match,
            context: line.trim().slice(0, 120),
          });
        }
      });
    }
  }
  return violations;
}

function formatViolations(violations: Violation[]): string {
  const grouped = new Map<string, Violation[]>();
  for (const v of violations) {
    if (!grouped.has(v.file)) grouped.set(v.file, []);
    grouped.get(v.file)!.push(v);
  }
  const lines: string[] = [];
  lines.push(`✗ Found ${violations.length} Tailwind content-scanner hazard(s):`);
  lines.push('');
  for (const [file, items] of grouped) {
    lines.push(`  ${file}`);
    for (const v of items) {
      lines.push(`    line ${v.line}: ${v.match}`);
      lines.push(`      ${v.context}`);
    }
  }
  return lines.join('\n');
}

export async function main(): Promise<number> {
  try {
    const allowlist = await loadAllowlist();
    const violations = await scan(allowlist);
    if (violations.length === 0) {
      console.log('✓ No Tailwind content-scanner hazards found.');
      return 0;
    }
    console.error(formatViolations(violations));
    console.error('');
    console.error('Fix: rewrite the class literal in the comment/string without brace expansion.');
    console.error(
      '     Use prose like `bg-ui-glass-1` (or `bg-ui-glass-2`) instead of `bg-ui-glass-{1,2}`.',
    );
    console.error(
      `     If a hazard is intentional, add it to ${relative(ROOT, ALLOWLIST_PATH)} with a justification comment.`,
    );
    return 1;
  } catch (err) {
    console.error('check-tailwind-content-scanner failed:', err);
    return 2;
  }
}

// Run if invoked directly (not when imported for tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
