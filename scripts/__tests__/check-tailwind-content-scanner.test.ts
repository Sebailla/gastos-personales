/**
 * scripts/__tests__/check-tailwind-content-scanner.test.ts
 *
 * Unit tests for the Tailwind v4 content-scanner hazard detector.
 * Runs as part of the regular Vitest suite via the project's
 * `vitest.config.ts` (no separate config needed).
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractMatches, loadAllowlist, walk } from '../check-tailwind-content-scanner';

describe('extractMatches', () => {
  it('detects brace-expansion utility-class-looking tokens', () => {
    expect(extractMatches('`bg-ui-glass-{1,2}`')).toEqual(['bg-ui-glass-{1,2}']);
  });

  it('detects multiple matches on one line', () => {
    const line = '`bg-ui-glass-{1,2}` + `backdrop-blur-[var(--ui-glass-blur-{sm,lg})]`';
    const matches = extractMatches(line);
    expect(matches).toContain('bg-ui-glass-{1,2}');
    // The hazard is captured from the first `[a-z]` whose sequence
    // includes a `-\{...\}` block. Here that is `ui-glass-blur-{sm,lg}`.
    expect(matches).toContain('ui-glass-blur-{sm,lg}');
  });

  it('does not match literal utility classes without braces', () => {
    expect(extractMatches('`bg-ui-glass-1 shadow-glass`')).toEqual([]);
    expect(extractMatches('`backdrop-blur-[var(--ui-glass-blur-sm)]`')).toEqual([]);
  });

  it('does not match non-class tokens with braces', () => {
    expect(extractMatches('const x = {a: 1, b: 2};')).toEqual([]);
    expect(extractMatches('`{key,value}`')).toEqual([]);
  });

  it('matches multiple variants in a single token', () => {
    expect(extractMatches('`text-{red,blue}-{500,600}`')).toEqual(['text-{red,blue}-{500,600}']);
  });

  it('matches single-variant braces (the wrong pattern)', () => {
    // `{1}` alone with no comma is still brace-expansion-shaped and
    // could confuse the scanner. It is NOT valid CSS. We flag it.
    expect(extractMatches('`text-{red}`')).toEqual(['text-{red}']);
  });
});

describe('loadAllowlist', () => {
  it('returns empty set if allowlist file does not exist', async () => {
    const allowlist = await loadAllowlist('/nonexistent/path/to/allowlist.txt');
    expect(allowlist.size).toBe(0);
  });

  it('parses lines, ignoring comments and blanks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tw-allowlist-'));
    try {
      const path = join(dir, 'allowlist.txt');
      await writeFile(
        path,
        [
          '# Header comment',
          '',
          'foo-{a,b}',
          '   bar-{1,2}   ',
          '# Trailing comment',
          'baz-{x,y}',
        ].join('\n'),
      );
      const allowlist = await loadAllowlist(path);
      expect(allowlist.size).toBe(3);
      expect(allowlist.has('foo-{a,b}')).toBe(true);
      expect(allowlist.has('bar-{1,2}')).toBe(true);
      expect(allowlist.has('baz-{x,y}')).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe('walk', () => {
  it('yields files with SCAN_EXTS extensions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tw-walk-'));
    try {
      await mkdir(join(dir, 'sub'));
      await writeFile(join(dir, 'a.ts'), '');
      await writeFile(join(dir, 'b.tsx'), '');
      await writeFile(join(dir, 'c.md'), '');
      await writeFile(join(dir, 'd.txt'), '');
      await writeFile(join(dir, 'sub', 'e.mdx'), '');
      const files: string[] = [];
      for await (const file of walk(dir)) files.push(file);
      expect(files.length).toBe(4);
      expect(files.every((f) => /\.(ts|tsx|md|mdx)$/.test(f))).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('skips SKIP_DIRS and dotfile directories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tw-walk-skip-'));
    try {
      await mkdir(join(dir, 'node_modules'));
      await mkdir(join(dir, '.next'));
      await mkdir(join(dir, '.hidden'));
      await writeFile(join(dir, 'a.ts'), '');
      await writeFile(join(dir, 'node_modules', 'b.ts'), '');
      await writeFile(join(dir, '.next', 'c.ts'), '');
      await writeFile(join(dir, '.hidden', 'd.ts'), '');
      const files: string[] = [];
      for await (const file of walk(dir)) files.push(file);
      expect(files.length).toBe(1);
      expect(files[0]).toContain('a.ts');
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('yields nothing for a non-existent directory', async () => {
    const files: string[] = [];
    for await (const file of walk('/nonexistent/path/here')) files.push(file);
    expect(files).toEqual([]);
  });
});
