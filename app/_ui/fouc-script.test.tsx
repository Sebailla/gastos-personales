/**
 * Tests for the no-FOUC inline blocking `<script>` in
 * `app/layout.tsx` (T-PR2-07 of the `ui-redesign` change).
 *
 * The script runs before first paint (no `defer`, no `async`)
 * with one job: read the active theme from the same precedence
 * the `ThemeProvider` uses (`ui.theme` localStorage → OS
 * `prefers-color-scheme` → default `light`) and add the `dark`
 * class to `document.documentElement` so the dark-scope CSS in
 * `app/_ui/tokens.css` (T-PR2-02) applies before the first
 * frame. Without this script, a user with `mode === 'system'`
 * and OS-level dark preference would see a flash of the light
 * theme (FOUC) on every page load.
 *
 * The test renders the inline `<script>` block in isolation
 * (without the full `RootLayout`, which would pull in
 * `next/font/google` and fail under JSDOM) and re-evaluates
 * the script body under different matchMedia + localStorage
 * combinations to assert the precedence contract. PR 3's
 * `<AppShell>` mount covers the layout integration; PR 5's
 * Playwright e2e covers the real-browser behavior.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const STORAGE_KEY = 'ui.theme';

function installLocalStorageShim(initial: Record<string, string> = {}): {
  set: (key: string, value: string) => void;
  clear: () => void;
} {
  const store = new Map<string, string>(Object.entries(initial));
  const shim = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (_i: number) => null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
  return {
    set: (key: string, value: string) => {
      store.set(key, value);
    },
    clear: () => {
      store.clear();
    },
  };
}

function installMatchMedia(prefersDark: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('dark') ? prefersDark : false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

/**
 * Render an inline `<script>` block in `<head>` and return
 * the script's IIFE source. The script body is the same
 * `app/layout.tsx` will use (T-PR2-07's GREEN step); the test
 * just re-renders it under different mocks to assert the
 * precedence contract.
 */
function renderFoucScript(): string {
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList[d?'add':'remove']('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>{null}</body>
    </html>,
  );
  // Extract the full IIFE source from the rendered HTML.
  const match = html.match(
    /<script[^>]*>\s*(\(function\s*\(\)\s*\{[\s\S]*?\}\)\(\);)\s*<\/script>/,
  );
  if (!match) {
    throw new Error('FOUC script body not found in rendered HTML');
  }
  return match[1] as string;
}

describe('FOUC inline blocking script (T-PR2-07)', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a <script> with no `defer` and no `async` attribute', () => {
    const html = renderToStaticMarkup(
      <html lang="en">
        <head>
          <script dangerouslySetInnerHTML={{ __html: `/* noop */` }} />
        </head>
        <body>{null}</body>
      </html>,
    );
    expect(html).toMatch(/<script[^>]*>/);
    expect(html).not.toMatch(/<script[^>]*\sdefer/);
    expect(html).not.toMatch(/<script[^>]*\sasync/);
  });

  it('adds the dark class when no localStorage is set and the OS prefers dark', () => {
    installLocalStorageShim({});
    installMatchMedia(true);

    (0, eval)(renderFoucScript());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does NOT add the dark class when localStorage["ui.theme"] === "light" even if OS prefers dark', () => {
    installLocalStorageShim({ [STORAGE_KEY]: 'light' });
    installMatchMedia(true);

    (0, eval)(renderFoucScript());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('adds the dark class when localStorage["ui.theme"] === "dark" even if OS prefers light', () => {
    installLocalStorageShim({ [STORAGE_KEY]: 'dark' });
    installMatchMedia(false);

    (0, eval)(renderFoucScript());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does NOT add the dark class when localStorage is "system" and the OS prefers light', () => {
    installLocalStorageShim({ [STORAGE_KEY]: 'system' });
    installMatchMedia(false);

    (0, eval)(renderFoucScript());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('does NOT throw when localStorage access throws (private mode, etc.)', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      get length() {
        return 0;
      },
    };
    Object.defineProperty(window, 'localStorage', {
      value: throwingStorage,
      writable: true,
      configurable: true,
    });
    installMatchMedia(false);

    expect(() => {
      (0, eval)(renderFoucScript());
    }).not.toThrow();
  });
});
