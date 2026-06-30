/**
 * RED → GREEN → TRIANGULATE coverage for `next/font/google` wiring
 * in `app/layout.tsx` + the `@theme inline` mapping in
 * `app/globals.css`.
 *
 * REQ-UI-18 demands:
 *   1. No `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`
 *      in the rendered HTML (Google Fonts CDN must not be a render
 *      dependency — LCP depends on it not blocking the bootstrap).
 *   2. The root `<html>` element carries the CSS custom properties
 *      `--font-inter` and `--font-jb-mono` set by the `next/font`
 *      loader.
 *   3. Tailwind's `font-sans` utility resolves to `var(--font-inter)`
 *      and `font-mono` resolves to `var(--font-jb-mono)` via the
 *      `@theme inline` mapping in `app/globals.css`.
 *
 * jsdom is used here (per `vitest.config.ts`'s
 * `environmentMatchGlobs` rule for `app/_ui/**`). `next/font` is
 * exercised through the layout render — we mock the loader to
 * produce predictable CSS variable values so the assertions are
 * independent of the real Google Fonts download.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Mock `next/font/google` so the test surface does not depend on the
// real Google Fonts CDN. The mock factory mimics the
// `next/font`-shaped return value: `variable` is the CSS variable
// name and `className` is the class applied to the wrapping element.
vi.mock('next/font/google', () => ({
  Inter: (_options: unknown) => ({
    variable: '--font-inter',
    className: '__className_inter',
    style: { fontFamily: '__inter_family__' },
  }),
  JetBrains_Mono: (_options: unknown) => ({
    variable: '--font-jb-mono',
    className: '__className_jb-mono',
    style: { fontFamily: '__jb_mono_family__' },
  }),
}));

const RootLayout = (await import('../layout')).default;

function render(): string {
  return renderToStaticMarkup(
    <RootLayout>
      <span>child</span>
    </RootLayout>,
  );
}

describe('next/font wiring (REQ-UI-18)', () => {
  it('does not emit any Google Fonts CDN <link>', () => {
    // Arrange + Act
    const html = render();

    // Assert
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('applies --font-inter and --font-jb-mono CSS variables on the root <html>', () => {
    // Arrange + Act
    const html = render();

    // Assert — the loader's `variable` is rendered as a class on
    // the <html> element so the CSS variable is scoped to the
    // document root.
    expect(html).toMatch(/class="[^"]*--font-inter[^"]*"/);
    expect(html).toMatch(/class="[^"]*--font-jb-mono[^"]*"/);
  });

  it('maps Tailwind font-sans to var(--font-inter) via @theme inline', () => {
    // Arrange — read the @theme inline block from globals.css.
    // Vitest does not transform `?raw` imports without explicit
    // vite-plugin-glob / vite-plugin-static-copy setup; reading
    // the file via fs is the project-standard pattern (see
    // `app/api/auth/[...nextauth]/route.test.ts` precedent).
    const globalsCss = readFileSync(resolve(__dirname, '..', 'globals.css'), 'utf8');

    // Assert
    expect(globalsCss).toMatch(/--font-sans:\s*var\(--font-inter\)/);
  });

  it('maps Tailwind font-mono to var(--font-jb-mono) via @theme inline', () => {
    // Arrange
    const globalsCss = readFileSync(resolve(__dirname, '..', 'globals.css'), 'utf8');

    // Assert
    expect(globalsCss).toMatch(/--font-mono:\s*var\(--font-jb-mono\)/);
  });
});
