/**
 * Tests for `app/_ui/providers/theme-provider.tsx` (T-PR2-06 of
 * the `ui-redesign` change).
 *
 * The `ThemeProvider` exposes a `useTheme()` hook with:
 *   - `mode`: 'system' | 'light' | 'dark' (user choice)
 *   - `resolved`: 'light' | 'dark' (the active theme after
 *      resolving `system` via the OS preference)
 *   - `setMode(mode)`: set + persist to localStorage
 *   - `cycle()`: advance to the next mode in
 *      `['system', 'light', 'dark']` and wrap
 *
 * The provider writes `ui.theme` to `localStorage` and toggles
 * `<html class="dark">` so the dark-scope CSS in
 * `app/_ui/tokens.css` (T-PR2-02) applies. The inline FOUC
 * script in `app/layout.tsx` (T-PR2-07) is responsible for the
 * class on first paint; this provider keeps it in sync after
 * the user toggles.
 *
 * Under `mode === 'system'`, the provider subscribes to
 * `matchMedia('(prefers-color-scheme: dark)')` and updates the
 * resolved theme + `<html>` class on OS-level changes. The
 * subscription is attached only when `mode === 'system'` and
 * is detached on unmount (or when the mode changes).
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { ThemeProvider, useTheme } from './theme-provider';

// `toHaveNoViolations` is registered globally via
// `test/axe-setup.ts` (see vitest.config.ts setupFiles); no
// local `expect.extend` here — the local one would shadow the
// global matcher's `compare` and crash the a11y test with
// "Cannot read properties of undefined (reading 'call')".

const STORAGE_KEY = 'ui.theme';

/**
 * Minimal in-memory `localStorage` shim. The project's vitest
 * config runs `app/_ui/**` tests under jsdom (per
 * `environmentMatchGlobs`), but jsdom's localStorage is not
 * always available without the `--localstorage-file` flag.
 * The shim gives the ThemeProvider's `localStorage` calls a
 * deterministic backing store without depending on jsdom's
 * own implementation.
 */
function installLocalStorageShim(): {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  clear: () => void;
  remove: (key: string) => void;
} {
  const store = new Map<string, string>();
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
    get: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    set: (key: string, value: string) => {
      store.set(key, value);
    },
    clear: () => {
      store.clear();
    },
    remove: (key: string) => {
      store.delete(key);
    },
  };
}

/**
 * Test fixture: a minimal matchMedia shim that exposes
 * `addEventListener` + `removeEventListener` (the real
 * JSDOM does not, and the production code subscribes via
 * `addEventListener('change', ...)`). The `prefersDark`
 * flag is mutable so each test can flip the system
 * preference and observe the listener firing.
 */
function installMatchMedia(prefersDark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    get matches() {
      return prefersDark;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      listeners.delete(cb);
    },
    addListener: (cb: (e: { matches: boolean }) => void) => {
      listeners.add(cb);
    },
    removeListener: (cb: (e: { matches: boolean }) => void) => {
      listeners.delete(cb);
    },
    dispatchEvent: () => true,
  };
  vi.spyOn(window, 'matchMedia').mockImplementation(() => mql as unknown as MediaQueryList);
  return {
    setPrefersDark: (next: boolean) => {
      prefersDark = next;
      for (const cb of listeners) {
        cb({ matches: next });
      }
    },
    listenerCount: () => listeners.size,
  };
}

describe('ThemeProvider (T-PR2-06)', () => {
  beforeEach(() => {
    installLocalStorageShim();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exposes the initial mode from localStorage if present', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark');
    installMatchMedia(false);

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.mode).toBe('dark');
    expect(result.current.resolved).toBe('dark');
  });

  it('cycles system → light → dark → system on three cycle() calls', () => {
    installMatchMedia(false);

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.mode).toBe('system');

    act(() => {
      result.current.cycle();
    });
    expect(result.current.mode).toBe('light');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');

    act(() => {
      result.current.cycle();
    });
    expect(result.current.mode).toBe('dark');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');

    act(() => {
      result.current.cycle();
    });
    expect(result.current.mode).toBe('system');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('system');
  });

  it('setMode("dark") writes "dark" to localStorage and toggles <html class="dark">', () => {
    installMatchMedia(false);

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setMode('dark');
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setMode("light") removes <html class="dark">', () => {
    installMatchMedia(false);
    document.documentElement.classList.add('dark');

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setMode('light');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('attaches a matchMedia listener when mode === "system" and detaches on unmount', () => {
    const mq = installMatchMedia(false);

    const { unmount } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(mq.listenerCount()).toBe(1);

    unmount();

    expect(mq.listenerCount()).toBe(0);
  });

  it('does NOT attach a matchMedia listener when mode !== "system"', () => {
    const mq = installMatchMedia(false);

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setMode('light');
    });

    expect(mq.listenerCount()).toBe(0);
  });

  it('resolves "system" mode to "dark" when the OS preference is dark', () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.mode).toBe('system');
    expect(result.current.resolved).toBe('dark');
  });

  it('updates resolved + <html> when the OS preference flips while mode === "system"', () => {
    const mq = installMatchMedia(false);

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => {
      mq.setPrefersDark(true);
    });

    expect(result.current.resolved).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('renders without a11y violations', async () => {
    installMatchMedia(false);

    const { container } = render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('throws when useTheme is used outside a ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
  });
});
