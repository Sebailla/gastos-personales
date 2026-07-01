'use client';

/**
 * ThemeProvider — the `ui-redesign` triple-state theme controller
 * (REQ-UI-14).
 *
 * Exposes a `useTheme()` hook with:
 *   - `mode`: 'system' | 'light' | 'dark' (the user's choice)
 *   - `resolved`: 'light' | 'dark' (the active theme after
 *      resolving `system` via `prefers-color-scheme: dark`)
 *   - `setMode(mode)`: set the mode + persist to localStorage
 *   - `cycle()`: advance to the next mode in
 *      `['system', 'light', 'dark']` and wrap
 *
 * On mount and on every mode change, the provider:
 *   1. Writes `ui.theme` to `localStorage` so the next page
 *      load's inline FOUC script (T-PR2-07) reads the same
 *      value.
 *   2. Adds/removes the `dark` class on `documentElement` so
 *      the dark-scope CSS in `app/_ui/tokens.css` (T-PR2-02)
 *      applies.
 *
 * The provider does NOT take ownership of the initial
 * `<html class>` write — the inline FOUC script in
 * `app/layout.tsx` runs before first paint and seeds the
 * class. The provider's effect runs after the React tree
 * mounts, so it never re-renders the class with a stale
 * value. If the user toggles the theme after mount, the
 * effect re-applies the class.
 *
 * Under `mode === 'system'`, the provider subscribes to
 * `matchMedia('(prefers-color-scheme: dark)')` and re-applies
 * the resolved theme + `<html>` class on every OS-level
 * change. The subscription is attached only when
 * `mode === 'system'` and is detached on unmount (or when
 * the user picks an explicit mode).
 *
 * The 'use client' directive is required because the
 * provider reads `localStorage` and `matchMedia` at render
 * time and uses `useEffect` for side effects.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (next: ThemeMode) => void;
  cycle: () => void;
}

const STORAGE_KEY = 'ui.theme';
const CYCLE_ORDER: readonly ThemeMode[] = ['system', 'light', 'dark'];

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  // `localStorage` may be undefined in non-DOM environments
  // (static render, server-side, jsdom without
  // `--localstorage-file`). Fall through to the system default
  // in that case rather than throwing.
  const stored = window.localStorage?.getItem(STORAGE_KEY) ?? null;
  return isThemeMode(stored) ? stored : 'system';
}

function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  // `matchMedia` may be undefined in non-DOM environments
  // (static render, server-side, jsdom before the test shim
  // installs it). Fall through to the light default in that
  // case rather than throwing.
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return readSystemPrefersDark() ? 'dark' : 'light';
}

function applyResolvedClass(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(readInitialMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readInitialMode()));

  // Persist + apply on every mode change.
  useEffect(() => {
    const next = resolveTheme(mode);
    setResolved(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
    applyResolvedClass(next);
  }, [mode]);

  // Subscribe to OS color-scheme changes only when mode === 'system'.
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      const next: ResolvedTheme = event.matches ? 'dark' : 'light';
      setResolved(next);
      applyResolvedClass(next);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
  }, []);

  const cycle = useCallback(() => {
    setModeState((prev) => {
      const idx = CYCLE_ORDER.indexOf(prev);
      // CYCLE_ORDER is a 3-element list; the next index is
      // (idx + 1) % 3. The fallback to 'system' is a guard
      // for the impossible "no entry" case.
      return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length] ?? 'system';
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
