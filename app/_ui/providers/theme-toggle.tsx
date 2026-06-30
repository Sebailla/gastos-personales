'use client';

/**
 * ThemeToggle — the user-facing button for the triple-state
 * theme cycle (T-PR2-08 of the `ui-redesign` change,
 * REQ-UI-14).
 *
 * Renders a single `<button type="button">` that calls the
 * `cycle()` action from the `ThemeProvider` (T-PR2-06). The
 * button's `aria-pressed` is `true` whenever the user has
 * picked an explicit mode (`light` or `dark`) and `false`
 * when the mode is `system` (the OS preference is in
 * effect). The `aria-label` describes the current mode and
 * the action ("Click to change") so screen readers announce
 * both pieces of information.
 *
 * On `≥ sm` viewports the button renders a glyph + a visible
 * label (e.g. "Sistema", "Claro", "Oscuro"). On `< sm` the
 * label is hidden and the glyph is the only visible cue
 * (the `aria-label` keeps the screen-reader experience
 * identical across breakpoints).
 *
 * The component is a Client Component because it consumes
 * the `useTheme()` context (which subscribes to
 * `matchMedia` + `localStorage`) and uses an event handler.
 */

import { useTheme, type ThemeMode } from './theme-provider';

const LABELS: Record<ThemeMode, { label: string; aria: string }> = {
  system: { label: 'Sistema', aria: 'Tema: sistema. Click para cambiar.' },
  light: { label: 'Claro', aria: 'Tema: claro. Click para cambiar.' },
  dark: { label: 'Oscuro', aria: 'Tema: oscuro. Click para cambiar.' },
};

const GLYPHS: Record<ThemeMode, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

export function ThemeToggle(): React.JSX.Element {
  const { mode, cycle } = useTheme();
  const { label, aria } = LABELS[mode];
  const glyph = GLYPHS[mode];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-pressed={mode !== 'system'}
      aria-label={aria}
      data-testid="ui-theme-toggle"
      className="inline-flex items-center gap-2 rounded-ui-md px-ui-space-2 py-ui-space-1 text-ui-text-sm font-ui-font-medium text-ui-fg hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2"
    >
      <span aria-hidden="true" className="text-base leading-none">
        {glyph}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
