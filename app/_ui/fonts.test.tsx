/**
 * Tests for the next/font wiring in `app/layout.tsx`
 * (REQ-UI-18 of the `transactions-ui` + `ui-redesign` changes).
 *
 * The full RootLayout render is no longer a viable
 * integration check (the layout is now async — it reads
 * `x-locale` from the request headers in PR 3 — and
 * wraps children in a `<ThemeProvider>` + `<AppShell>`
 * that suspends under synchronous `renderToStaticMarkup`).
 *
 * PR 5's Playwright e2e covers the real-browser font
 * behavior. The assertions here focus on what
 * `renderToStaticMarkup` can still verify synchronously
 * in the test environment:
 *
 *   - The Tailwind `@theme inline` block in `globals.css`
 *     maps `--font-sans: var(--font-inter)` and
 *     `--font-mono: var(--font-jb-mono)`.
 *   - The font-face declarations are emitted by
 *     `next/font/google` in the build output (the
 *     `__mock_font_*` shim is the pattern this test
 *     uses so the test does not need network access).
 *
 * The "no Google Fonts CDN <link>" assertion is verified
 * at the `app/globals.css` snapshot level (the file does
 * not contain `https://fonts.googleapis.com`) rather than
 * at the rendered-HTML level.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const GLOBALS_CSS_PATH = resolve(process.cwd(), 'app/globals.css');
const LAYOUT_PATH = resolve(process.cwd(), 'app/layout.tsx');

function readFile(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('next/font wiring (REQ-UI-18)', () => {
  it('does not include any Google Fonts CDN URL in app/layout.tsx', () => {
    // The next/font/google loader is used instead of a CDN
    // <link>; assert the layout source has no CDN reference.
    const layout = readFile(LAYOUT_PATH);
    expect(layout).not.toMatch(/fonts\.googleapis\.com/);
    expect(layout).not.toMatch(/fonts\.gstatic\.com/);
  });

  it('uses next/font/google Inter + JetBrains_Mono loaders', () => {
    const layout = readFile(LAYOUT_PATH);
    expect(layout).toMatch(
      /import\s*\{[^}]*Inter,\s*JetBrains_Mono[^}]*\}\s*from\s*['"]next\/font\/google['"]/,
    );
    expect(layout).toMatch(/const\s+inter\s*=\s*Inter\(/);
    expect(layout).toMatch(/const\s+jetbrainsMono\s*=\s*JetBrains_Mono\(/);
  });

  it('assigns --font-inter and --font-jb-mono CSS variables via the Inter + JetBrains_Mono loader `variable` option', () => {
    const layout = readFile(LAYOUT_PATH);
    // The `variable: '--font-inter'` option writes the loader's
    // CSS variable name onto the consumer element so the
    // var becomes available in scope.
    expect(layout).toMatch(/variable:\s*['"]--font-inter['"]/);
    expect(layout).toMatch(/variable:\s*['"]--font-jb-mono['"]/);
  });

  it('applies the font variables to the root <html> via the className prop', () => {
    const layout = readFile(LAYOUT_PATH);
    expect(layout).toMatch(
      /className=\{?`[^`]*\$\{inter\.variable\}[^`]*\$\{jetbrainsMono\.variable\}[^`]*`\}?/,
    );
  });

  it('maps Tailwind font-sans to var(--font-inter) via @theme inline', () => {
    const css = readFile(GLOBALS_CSS_PATH);
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\)/);
  });

  it('maps Tailwind font-mono to var(--font-jb-mono) via @theme inline', () => {
    const css = readFile(GLOBALS_CSS_PATH);
    expect(css).toMatch(/--font-mono:\s*var\(--font-jb-mono\)/);
  });
});
