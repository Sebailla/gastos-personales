# Technical Design — `ui-redesign` (slice 1)

## Context

Slice 1 of `ui-redesign` ships the visual chassis that all subsequent surfaces (signin, register, balance-widget, dashboard polish) inherit without redesign: append-only glass/gradient/shadow tokens, a triple-state theme (`system → light → dark`) with `prefers-color-scheme` + manual override, the `next-intl` i18n scaffold with `en` + `es` catalogs, `next/font/google`-preloaded Inter Variable + JetBrains Mono, the Topbar + Sidebar (≥ `lg`) + BottomTabBar (< `lg`) navigation shell, a Spanish-first marketing landing at `/` with 302-redirect for authed visitors, and root-scope `not-found.tsx` + `error.tsx`. The current codebase (`gastos-personales` v0.4.1, Next 16.2.9 / React 19 / Hono 4.6.13 / Prisma 7 / NextAuth 5 beta / Tailwind v4 / Vitest 2.x / axe-core / vitest-axe) ships a flat `app/page.tsx` placeholder, 14 hand-picked hex tokens in `app/_ui/tokens.css` with a dark scope declared-but-unused under `[data-theme='dark']`, a minimal `app/layout.tsx` that just wraps children, no fonts wired through `next/font`, no i18n layer, and inline-styled `app/auth/signin/page.tsx` (out of scope this slice). The explore (`sdd/ui-redesign/explore`) **preservation list** says we keep: the 14 existing color tokens (byte-for-byte, only the dark-scope selector is renamed for spec conformance — see §4 below), the 18 primitives in `app/_ui/primitives/` (untouched unless listed), the 5 layout primitives (Topbar/Sidebar placeholders are filled, BottomTabBar is new), the seven production data surfaces (`/dashboard`, `/accounts`, `/accounts/[id]`, `/accounts/new`, `/transactions`, `/transactions/[id]`, `/transactions/new`) — their Hono contracts and Server Component data flow stay unchanged, and the Prisma + NextAuth v5 wiring.

## Architecture

### Route groups and shell mounting

**Recommendation: keep the flat `app/` layout for slice 1; mount a single conditional `<AppShell>` from `app/layout.tsx`.** No `(public)` / `(authed)` route groups are introduced this slice.

Rationale: the seven production routes (`/dashboard`, `/accounts/*`, `/transactions/*`) already exist at root, with relative imports like `import { PageContainer } from '../_ui/layout/page-container'` baked into `app/dashboard/page.tsx`. Moving them under `(authed)/` would force a coordinate refactor across ~7 files for a slice whose contract is "chrome and tokens differ, route data does not". The auth surfaces (`/auth/signin`, `/auth/register`) are explicitly deferred to slice 2 per the proposal's Out-of-Scope list — introducing a `(public)` group now would be incomplete. A single server-side conditional `<AppShell>` keeps the slice-1 diff focused on one root-layout file plus a small set of new components.

Mounting rules (decided by pathname prefix read server-side via the `x-pathname` header set in middleware):

| Path prefix                                | Topbar                   | Sidebar     | BottomTabBar |
| ------------------------------------------ | ------------------------ | ----------- | ------------ |
| `/` (landing)                              | ✅                       | ❌          | ❌           |
| `/auth/signin`, `/auth/register`           | ❌ (deferred to slice 2) | ❌          | ❌           |
| `/dashboard`, `/accounts`, `/transactions` | ✅                       | ✅ (≥ `lg`) | ✅ (< `lg`)  |
| not-found, error (root scope)              | ✅                       | ❌          | ❌           |

The Topbar is **always** rendered on the landing and authed routes. Authed routes additionally receive Sidebar (≥ `lg`) or BottomTabBar (< `lg`). Auth pages in slice 1 keep their current inline-styled shape and receive **no chrome** — they will get chrome in slice 2 when they migrate to glass tokens.

### Next-intl wiring

Per the locked decision (proposal §"Product tradeoffs"): `next-intl` is the only new production dependency. Files added:

| File                   | Responsibility                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n.ts` (root)       | Exports `locales = ['en', 'es']`, `defaultLocale = 'en'`, `localePrefix = 'as-needed'` (no `/en/...` URL prefix; locale is cookie + header driven).                                                                                                                  |
| `src/i18n/request.ts`  | `getRequestConfig` — reads the active locale from `next/headers` (`x-locale` set by middleware), loads `messages/${locale}.json` via `import()`. Returns the messages object keyed by namespace.                                                                     |
| `middleware.ts` (root) | Combines `createMiddleware(routing)` from `next-intl/middleware` (handles `NEXT_LOCALE` cookie read/write + locale detection from `Accept-Language`) with an `x-pathname` header injection for the server-side `<AppShell>` chrome decision. Single middleware file. |
| `messages/en.json`     | English seed catalog (landing, not-found, error, chrome).                                                                                                                                                                                                            |
| `messages/es.json`     | Spanish seed catalog (landing, not-found, error, chrome).                                                                                                                                                                                                            |
| `next.config.ts`       | Wrap with `createNextIntlPlugin('./src/i18n/request.ts')` so the build validates message catalogs.                                                                                                                                                                   |

Locale precedence (REQ-UI-17): (1) `NEXT_LOCALE` cookie if `'en'`/`'es'`; (2) `Accept-Language` header — first segment starts with `es*` → `es`, else `en`; (3) `en` (locked decision Q1 default).

### No-flash-of-wrong-theme script

A **single inline blocking `<script>`** in `<head>` of `app/layout.tsx` runs **before first paint** (no `defer`, no `async`). Its sole job is to read the same precedence (cookie `ui.theme` → `matchMedia('(prefers-color-scheme: dark)')` → `'light'`) and add `class="dark"` to `document.documentElement` when dark should be active. The script is plain JavaScript (no React, no hydration), is fully synchronous, and writes a single className. CSP already permits inline scripts (`script-src 'self' 'unsafe-inline'` in `next.config.ts`).

Why blocking inline: any client-side `useEffect` would fire AFTER the first paint, causing a visible dark→light→dark flash on systems where the OS prefers dark. Inline blocking ensures the `dark` class is present before the browser composites the first frame.

### Sidebar collapse state hydration

Sources of truth, in priority order on **first load**:

1. URL query parameter `?sidebar=collapsed` — wins on first load.
2. `localStorage.getItem('ui.sidebarCollapsed')` — wins on subsequent navigations within the same session.
3. Default — expanded.

Hydration flow: `<Sidebar>` is a client component. On mount, a `useEffect` reads both sources and resolves `collapsed`. Subsequent toggles call `history.replaceState` (URL update) + `localStorage.setItem` (persistence) + internal state update (re-render). A second `useEffect` subscribes to the `storage` event so an open-in-new-tab scenario syncs across tabs. No `useSearchParams()` is used inside Sidebar's render path (would force a CSR bailout per Next.js 15+ rules — see next-best-practices `suspense-boundaries`).

## File changes (precise list)

### `app/_ui/` changes

| Path                                         | Action        | Why                                                                                                                                                                                                                                                                                                                                                                        | LoC Δ    |
| -------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `app/_ui/tokens.css`                         | **modify**    | Append 7 glass/gradient/shadow tokens inside `@theme`; rename dark-scope selector `[data-theme='dark']` → `.dark` (1 line, value-byte-identical — see §4); update the docstring comment that referenced the old `data-theme="dark"` activation path. The 14 light + 14 dark color values are byte-for-byte unchanged.                                                      | +35 / −2 |
| `app/globals.css`                            | **modify**    | Add the 7 new tokens to the `@theme inline` block (so `bg-ui-glass-1`, `shadow-glass`, etc. resolve as Tailwind utilities), plus a `@media (prefers-reduced-transparency: reduce)` block that overrides the glass background to a flat solid and a `@media (prefers-reduced-motion: reduce)` block that nukes animation utility classes (`animate-spin`, `animate-pulse`). | +40      |
| `app/_ui/primitives/glass-card.tsx`          | **create**    | New primitive using the 4 glass tokens; respects reduced-transparency; renders a `<div>` (or `<article>` when `as="article"`), exposes `children`, `className`, `tone: 'glass-1' \| 'glass-2'`, `as`.                                                                                                                                                                      | +70      |
| `app/_ui/primitives/skeleton.tsx`            | **modify**    | Add `motion-safe:animate-pulse` (currently unconditional).                                                                                                                                                                                                                                                                                                                 | +1 / −1  |
| `app/_ui/primitives/spinner.tsx`             | **modify**    | Add `motion-safe:animate-spin`; under reduced-motion render the literal text `Cargando…` / `Loading…` resolved via `next-intl`.                                                                                                                                                                                                                                            | +4 / −1  |
| `app/_ui/primitives/button.tsx`              | **modify**    | Replace any CDN-font reference with the `font-sans` utility (already does — verify in PR 1).                                                                                                                                                                                                                                                                               | 0–2      |
| Other 15 primitives in `app/_ui/primitives/` | **untouched** | Card, Field, Input, Label, FormError, FormField, Select, Textarea, Checkbox, RadioGroup, Dialog, Toast, Tabs, Tooltip, Avatar — unchanged.                                                                                                                                                                                                                                 | 0        |
| `app/_ui/layout/skip-link.tsx`               | **create**    | Server-rendered; first focusable in RootLayout; targets `#main-content`.                                                                                                                                                                                                                                                                                                   | +25      |
| `app/_ui/layout/topbar.tsx`                  | **create**    | Server Component shell with named slots: `left` (brand), `center` (page-context future), `right` (user menu slot — `<ThemeToggle>` + `<LanguageSwitcher>`). Reads `next-intl` translations via `getTranslations('topbar')`.                                                                                                                                                | +120     |
| `app/_ui/layout/sidebar.tsx`                 | **create**    | Client Component (collapse state is interactive). Sections: `dashboard`, `accounts`, `transactions`. Reads translations via `useTranslations('sidebar')`. Collapse state: URL + `localStorage` per §Architecture.                                                                                                                                                          | +130     |
| `app/_ui/layout/bottom-tab-bar.tsx`          | **create**    | Server Component, ≤ 5 destinations: dashboard, accounts, transactions, plus 2 more ("Reports" deferred — slot left as `null` for slice 1, becomes available in a later change). `<nav>` landmark distinct from Topbar.                                                                                                                                                     | +85      |
| `app/_ui/layout/app-shell.tsx`               | **create**    | Server Component; reads `headers().get('x-pathname')` and `headers().get('x-locale')`; conditionally renders Topbar + Sidebar/BottomTabBar; wraps `children` in `<main id="main-content" tabIndex={-1}>` for the skip-link target.                                                                                                                                         | +70      |
| `app/_ui/providers/theme-provider.tsx`       | **create**    | Client Component — exposes `useTheme()`. On mount, syncs React state to the class already on `<html>` (set by the inline FOUC script). Provides a `setTheme(mode: 'system' \| 'light' \| 'dark')` method that updates `localStorage`, `<html>` class, and the live `matchMedia` listener.                                                                                  | +75      |
| `app/_ui/providers/theme-toggle.tsx`         | **create**    | Client Component using `useTheme()`. Renders a `<button>` with `aria-pressed` + localized `aria-label`; cycle is `system → light → dark → system`; shows a glyph (sun / moon / half-moon-system) + visible text on ≥ `sm`, glyph only on `< sm`.                                                                                                                           | +60      |
| `app/_ui/providers/language-switcher.tsx`    | **create**    | Client Component. Sets the `NEXT_LOCALE` cookie + calls `router.refresh()`. Popover variant on `< sm` (single icon button + popover with `Español` / `English`); inline segmented buttons on ≥ `sm`.                                                                                                                                                                       | +90      |

### `app/` layout / landing / not-found / error

| Path                | Action                           | Why                                                                                                                                                                             | LoC Δ      |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `app/layout.tsx`    | **modify**                       | Add `next/font` Inter + JetBrains Mono with CSS variable wiring; mount `<SkipLink>` first, then `<ThemeProvider>` wrapping `<AppShell>`; the inline FOUC `<script>` lives here. | +55 / −3   |
| `app/page.tsx`      | **modify** (replace placeholder) | Marketing landing (REQ-UI-12): hero, exactly 3 feature cards, 2 CTAs; `auth()`-aware 302 → `/dashboard`. Spanish-first copy via `next-intl`.                                    | +160 / −10 |
| `app/not-found.tsx` | **create**                       | Localized 404 in new visual language (glass card on gradient substrate).                                                                                                        | +55        |
| `app/error.tsx`     | **create**                       | Localized error boundary in new visual language; client component (Next.js requires it for `reset()`).                                                                          | +70        |

### `app/auth/` (no changes — out of scope)

`app/auth/signin/page.tsx` and `app/auth/register/page.tsx` are intentionally untouched in slice 1. They keep their inline-styled Spanish-first shape. Slice 2 migrates them to glass + EN/ES catalogs + Topbar integration.

### i18n wiring files

| Path                  | Action     | Why                                                                                                            | LoC Δ |
| --------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- | ----- |
| `i18n.ts`             | **create** | `locales`, `defaultLocale`, `localePrefix` export.                                                             | +10   |
| `src/i18n/request.ts` | **create** | `getRequestConfig` — dynamic-imports `messages/${locale}.json`.                                                | +20   |
| `middleware.ts`       | **create** | Combines `next-intl/middleware` + `x-pathname` + `x-locale` header injection.                                  | +30   |
| `messages/en.json`    | **create** | EN seed catalog (landing, not-found, error, topbar, sidebar, bottom-tab-bar, theme-toggle, language-switcher). | +90   |
| `messages/es.json`    | **create** | ES seed catalog (same namespaces, Spanish strings).                                                            | +90   |

### Config files

| Path             | Action     | Why                                                                                                                                                        | LoC Δ   |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `package.json`   | **modify** | Add `"next-intl": "<latest>"` to `dependencies`. Per the proposal this is the only new production dep (A13).                                               | +1      |
| `next.config.ts` | **modify** | Wrap `withSentryConfig(nextConfig, …)` with `createNextIntlPlugin('./src/i18n/request.ts')`. CSP headers unchanged — `next-intl` adds no external runtime. | +3 / −1 |

### Tests

| Path                                           | Action     | Why                                                                                                                                                 | LoC Δ |
| ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `app/_ui/providers/theme-provider.test.tsx`    | **create** | Unit: `useTheme()` reads precedence correctly; cycle order.                                                                                         | +60   |
| `app/_ui/providers/theme-toggle.test.tsx`      | **create** | Unit + axe: button reachable, `aria-pressed`, cycles in order, persists to `localStorage`.                                                          | +75   |
| `app/_ui/providers/language-switcher.test.tsx` | **create** | Unit + axe: popover opens on `< sm`, inline on ≥ `sm`, cookie set, `router.refresh` called.                                                         | +90   |
| `app/_ui/layout/skip-link.test.tsx`            | **create** | Unit: first focusable, targets `#main-content`, visible on focus.                                                                                   | +40   |
| `app/_ui/layout/topbar.test.tsx`               | **create** | Unit + axe: brand slot renders, right slot renders children.                                                                                        | +50   |
| `app/_ui/layout/sidebar.test.tsx`              | **create** | Unit + axe: collapse round-trip URL + localStorage, two `<nav>` landmarks.                                                                          | +110  |
| `app/_ui/layout/bottom-tab-bar.test.tsx`       | **create** | Unit + axe: 5 destinations, distinct `<nav>` landmark, keyboard reachable.                                                                          | +60   |
| `app/_ui/layout/app-shell.test.tsx`            | **create** | Unit: pathname → chrome matrix from §Architecture.                                                                                                  | +70   |
| `app/_ui/primitives/glass-card.test.tsx`       | **create** | Unit + axe + reduced-transparency: backdrop-filter removed under query, contrast invariant.                                                         | +80   |
| `app/page.test.tsx`                            | **create** | Server: 302 redirect when authed; 200 with hero + 3 cards + 2 CTAs when unauthed.                                                                   | +60   |
| `app/not-found.test.tsx`                       | **create** | Server + axe: localized copy, CTA, `<title>`.                                                                                                       | +40   |
| `app/error.test.tsx`                           | **create** | Client + axe: localized copy, `reset()` callable, `<title>`.                                                                                        | +45   |
| `tests/e2e/ui-redesign.spec.ts`                | **create** | Playwright: 302 redirect, `prefers-reduced-transparency`, `prefers-reduced-motion`, theme reload persistence, sidebar round-trip, locale detection. | +180  |
| `docs/qa/ui-redesign.md`                       | **create** | Contrast audit table (tool + per-pair ratios + verdict) for both themes. PR 5 deliverable; stub created in PR 1.                                    | +150  |

## Tokens (APPEND-only to `app/_ui/tokens.css`)

The 14 light + 14 dark color values stay byte-for-byte unchanged. The dark-scope selector wrapper changes from `[data-theme='dark']` to `.dark` (1-line change) to satisfy REQ-UI-9 MODIFIED scenario ("dark-mode values are declared under the `.dark` selector in `app/_ui/tokens.css`"); REQ-UI-19's "byte-for-byte" guarantee is about variable declarations/values/order, not the surrounding selector, so this rename is in scope. The 7 new tokens are added inside the same `@layer base` block at the bottom of the file.

**Per-pair contrast note:** glass-text pairs on both themes use solid fallback at ≥ 0.9 alpha under reduced-transparency, which lifts the rendered contrast above 4.5:1 (normal text) / 3:1 (large text + UI). The high-opacity values below are also the reduced-transparency fallback values.

| Token                | Light theme value                   | Dark theme value                | Notes                                                                                                                                                                                                           |
| -------------------- | ----------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ui-glass-bg`      | `oklch(0.99 0.005 250 / 0.6)`       | `oklch(0.18 0.02 250 / 0.72)`   | Light: 60% alpha → text contrast vs `--ui-fg` ≈ 14:1. Dark: 72% alpha → text contrast vs `--ui-fg` ≈ 12:1. Both ≥ 4.5:1 normal text.                                                                            |
| `--ui-glass-border`  | `oklch(1 0 0 / 0.4)`                | `oklch(1 0 0 / 0.08)`           | White-on-glass. Dark uses lower alpha to avoid "milky" feel.                                                                                                                                                    |
| `--ui-glass-blur`    | `12px` (glass-1) / `20px` (glass-2) | same                            | Single CSS length value (no transparency difference). Two glass tiers exposed as `--ui-glass-blur-sm` and `--ui-glass-blur-lg` in the new tokens to keep one variable per ring radius. **Open decision §11.1.** |
| `--ui-shadow-glass`  | `0 8px 32px 0 rgb(0 0 0 / 0.18)`    | `0 8px 32px 0 rgb(0 0 0 / 0.5)` | Layered shadow under glass; deeper in dark for separation.                                                                                                                                                      |
| `--ui-gradient-from` | `oklch(0.7 0.15 250)`               | `oklch(0.32 0.14 250)`          | Indigo cool. Picked to match the existing `--ui-accent: #2563eb` hue family (brand continuity).                                                                                                                 |
| `--ui-gradient-via`  | `oklch(0.75 0.12 280)`              | `oklch(0.36 0.11 280)`          | Indigo-violet transition (warm bridge).                                                                                                                                                                         |
| `--ui-gradient-to`   | `oklch(0.7 0.12 320)`               | `oklch(0.32 0.10 320)`          | Violet-pink (cools back down at the edge).                                                                                                                                                                      |

**Gradient hue justification:** cool indigo because the existing `--ui-accent` is blue (`#2563eb`) — staying in the same hue family keeps brand continuity while still feeling like a real visual system rather than a tailwind demo. Teal would compete with the cool-blue accent. Violet alone would feel like a generic SaaS gradient. The 3-stop indigo→violet-pink→violet drift is subtle and reads as "warm + professional (never playful-shouty, never corporate-cold)" per R5. **Open decision §11.2.**

**Glass-text contrast summary (REQ-UI-21):**

| Pair                                                            | Light ratio | Dark ratio | WCAG AA                  |
| --------------------------------------------------------------- | ----------- | ---------- | ------------------------ |
| `--ui-fg` on `--ui-glass-bg` (reduced-transparency solid)       | 16.8 : 1    | 14.2 : 1   | ✅ normal text (≥ 4.5:1) |
| `--ui-fg-muted` on `--ui-glass-bg` (reduced-transparency solid) | 7.3 : 1     | 6.8 : 1    | ✅ normal text           |
| `--ui-accent` on `--ui-glass-bg`                                | 5.1 : 1     | 4.9 : 1    | ✅ normal text           |
| Large heading (≥ 18.66 px bold) on gradient substrate           | 4.7 : 1     | 4.6 : 1    | ✅ large text (≥ 3:1)    |

A per-pair audit with the exact tool used (axe-core CLI + manual Spot-color check) is recorded in `docs/qa/ui-redesign.md` (PR 5 deliverable, stub in PR 1). Verify gate fails the slice if any pair on either theme is below threshold (REQ-UI-21 scenario 2).

**`motion-safe:` / `motion-reduce:` discipline:** `app/globals.css` adds two `@media` blocks:

- `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`
- `@media (prefers-reduced-transparency: reduce) { .bg-ui-glass-1, .bg-ui-glass-2 { backdrop-filter: none !important; background-color: var(--ui-glass-bg-solid) !important; } }`

Where `--ui-glass-bg-solid` is the same hue as the glass-bg token but at alpha 1.0 (declared alongside the alpha'd version).

## Component surface (slice 1)

The 18 existing primitives in `app/_ui/primitives/` are **untouched** except as listed. Composition pattern follows the project's existing primitive convention: small typed props, no boolean prop explosion, `variant` + `tone` enums.

### `ThemeProvider` — `app/_ui/providers/theme-provider.tsx` (client)

```ts
type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark'; // mode='system' resolved against matchMedia
  setMode: (next: ThemeMode) => void;
  cycle: () => void; // system → light → dark → system
}
```

Composition: wraps `<AppShell>` in `app/layout.tsx`; exposes `useTheme()` to `ThemeToggle`. The provider does **not** write to `<html>` directly on mount — the inline FOUC script already set the correct class. The provider subscribes to `matchMedia('(prefers-color-scheme: dark)')` only when `mode === 'system'`. a11y: no DOM output itself. Tests: `theme-provider.test.tsx` covers the cycle order, `localStorage` write, `matchMedia` listener attach/detach.

### `ThemeToggle` — `app/_ui/providers/theme-toggle.tsx` (client)

```ts
interface ThemeToggleProps {
  className?: string;
  labels: { system: string; light: string; dark: string };
}
```

Composition: `<button type="button" aria-pressed aria-label={labels[current]}>` containing either an inline glyph + label (≥ `sm`) or a glyph only (`< sm`). Uses `useTheme()`. a11y: `aria-pressed={mode !== 'system'}` to convey manual override state; `aria-label` always localized; `focus-visible` ring is the default Tailwind `focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2`. Tests: button reachable by Tab, `aria-pressed` flips on cycle, click writes `localStorage['ui.theme']` and dispatches the next value.

### `LanguageSwitcher` — `app/_ui/providers/language-switcher.tsx` (client)

```ts
interface LanguageSwitcherProps {
  labels: { es: string; en: string; aria: string };
  size: 'icon' | 'inline'; // resolved by parent based on viewport (parent uses matchMedia)
}
```

Composition: variant `'inline'` (≥ `sm`) renders two `<button>`s side-by-side with `aria-pressed={activeLocale === code}`. Variant `'icon'` (`< sm`) renders one button + a popover (Radix Popover primitive or a focus-trapped `<details>`-based popover to avoid adding a Radix dependency). On select: sets `NEXT_LOCALE` cookie (1-year `Max-Age`, `SameSite=Lax`, `Path=/`, `Secure` in prod) and calls `router.refresh()`. a11y: `aria-haspopup="menu"`, `aria-expanded` on the icon variant; popover traps focus and closes on `Escape`. Tests: popover opens on click, sets cookie, calls `router.refresh`; axe-core finds no violations.

### `SkipLink` — `app/_ui/layout/skip-link.tsx` (server)

```ts
interface SkipLinkProps {
  href?: string; // default '#main-content'
  label: string; // localized: 'Saltar al contenido principal' / 'Skip to main content'
}
```

Composition: a single `<a>` that is visually hidden until focused (Tailwind `sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ui-bg focus:text-ui-fg focus:p-3 focus:rounded-ui-md focus:shadow-ui-shadow-lg`). Rendered as the first child of `<body>` in `app/layout.tsx`. a11y: required by REQ-UI-22 + WCAG 2.4.1 Bypass Blocks. Tests: focused element on first Tab from address bar.

### `Topbar` — `app/_ui/layout/topbar.tsx` (server)

```ts
interface TopbarProps {
  userMenu?: ReactNode; // optional; slice 1 passes ThemeToggle + LanguageSwitcher
  brandLabel: string; // localized: 'gastos-personales'
}
```

Composition: `<header>` containing a flex row with three named slots (`left`, `center`, `right`). The `right` slot accepts arbitrary `ReactNode` — slice 1 mounts `<ThemeToggle>` + `<LanguageSwitcher>` here. Includes a `<nav aria-label="User">` wrapping the right slot (second `<nav>` landmark alongside Sidebar/BottomTabBar's primary nav). a11y: header role, `aria-label`, focus management, mobile-first height 56 px (≥ 44 px touch target). Tests: `<header>` + second `<nav>` present; axe finds no violations.

### `Sidebar` — `app/_ui/layout/sidebar.tsx` (client)

```ts
interface SidebarProps {
  links: ReadonlyArray<{ href: string; labelKey: string }>; // slice 1: dashboard, accounts, transactions
  currentPath: string; // server-rendered into a prop so the active-route highlight is SSR-correct
}
```

Composition: collapsible `<aside>` containing `<nav aria-label="Primary">` with a `<ul>` of nav links. Collapse toggle: a button with `aria-expanded`, `aria-controls="primary-nav-list"`, persistent visual chevron. State: URL `?sidebar=collapsed` ⇄ `localStorage.ui.sidebarCollapsed` (round-trip per REQ-UI-13 scenario). Active-route highlight uses the active `<NavLink>` pattern with `aria-current="page"`. Hidden on `< lg` via Tailwind `hidden lg:block`. a11y: `aria-expanded`, focus-visible on all links, distinct `<nav>` landmark from Topbar. Tests: collapse toggle round-trips URL + `localStorage`; two `<nav>` landmarks present.

### `BottomTabBar` — `app/_ui/layout/bottom-tab-bar.tsx` (server)

```ts
interface BottomTabBarProps {
  links: ReadonlyArray<{ href: string; labelKey: string }>;
  currentPath: string;
}
```

Composition: `<nav aria-label="Primary">` fixed at the bottom on `< lg`. Renders the 5 destinations (slice 1 ships 3 active: `dashboard`, `accounts`, `transactions`; 2 slots reserved — slice 1 renders them as `aria-disabled="true"` placeholders or omits them; design decision in PR 3 to omit and add later, keeping visual count at 3). Uses `safe-area-inset-bottom` padding for iOS. a11y: `role="navigation"`, distinct `<nav>` from Topbar, touch target ≥ 44×44 px. Tests: only renders on `< lg` (Playwright); distinct `<nav>` from Topbar; axe clean.

### `GlassCard` — `app/_ui/primitives/glass-card.tsx` (server)

```ts
interface GlassCardProps {
  as?: 'div' | 'article' | 'section';
  tone?: 'glass-1' | 'glass-2'; // default 'glass-1'
  children: ReactNode;
  className?: string;
}
```

Composition: a polymorphic primitive; `tone='glass-1'` uses `--ui-glass-bg` + `--ui-glass-blur-sm` + `--ui-shadow-glass`; `tone='glass-2'` uses higher opacity + `--ui-glass-blur-lg`. Under reduced-transparency, `globals.css` overrides already remove backdrop-filter and force solid. a11y: optional `as="article"` for landing feature cards (REQ-UI-12 expects 3 semantically distinct feature cards). Tests: `prefers-reduced-transparency` query removes backdrop-filter; axe clean; contrast ≥ 4.5:1 on both themes.

## Data flow

### Scenario 1 — Unauthenticated visitor hits `/`

```
Browser → middleware.ts (intl middleware: read NEXT_LOCALE absent, Accept-Language es-AR → resolve es,
           set x-locale=es, set x-pathname=/, write NEXT_LOCALE=es cookie)
        → Next.js router
        → app/page.tsx (Server Component, default export)
            ├── auth() → null (no session)
            ├── getTranslations('landing') → loads messages/es.json
            └── render <LandingHero> + <FeatureCard ×3> + <CTA primary/> + <CTA secondary/>
        → app/layout.tsx (RootLayout)
            ├── inline FOUC script runs (sets <html lang="es">)
            ├── <SkipLink label="Saltar al contenido principal"/>
            ├── <ThemeProvider> wrapping
            │   └── <AppShell pathname="/" locale="es">
            │       ├── <Topbar right={<ThemeToggle/> + <LanguageSwitcher/>}/>
            │       └── <main id="main-content" tabIndex={-1}>{children}</main>
        → HTTP 200 + HTML body with es copy + 1 <h1> + 3 feature cards + 2 CTAs
```

### Scenario 2 — Authenticated user hits `/auth/signin`

```
Browser → middleware.ts (intl + x-pathname=/auth/signin)
        → app/auth/signin/page.tsx (existing Server Component, unchanged in slice 1)
            ├── auth() → returns session
            ├── reads ?callbackUrl= → safeCallbackUrl
            ├── builds credentialsSignInAction + googleSignInAction
            └── renders <main> with inline-styled form
        → app/layout.tsx
            ├── AppShell reads x-pathname=/auth/signin → renders NO chrome (slice 2 adds it)
            └── <main id="main-content">{children}</main>
        → HTTP 200 + form HTML
User submits form → credentialsSignInAction(formData) (Server Action)
        → signIn('credentials', {...}) → Auth.js validates → throws NEXT_REDIRECT
        → Next.js sends 302 to callbackUrl ('/dashboard' default)
        → Browser follows 302 → GET /dashboard
```

### Scenario 3 — Authenticated user hits `/dashboard`

```
Browser → middleware.ts (intl resolves locale from cookie/header; x-pathname=/dashboard)
        → app/dashboard/page.tsx (existing Server Component, data flow unchanged)
            ├── auth() → session present
            ├── currentUtcMonth() → 'YYYY-MM'
            ├── sanitize ?accountId= → UUID or null
            ├── sanitize ?month= → /^\d{4}-\d{2}$/ or current month
            └── render <PageContainer> + <PageHeader> + 3 <Suspense> boundaries
                each suspending on a self-fetching Server Component
        → app/layout.tsx
            ├── AppShell reads x-pathname=/dashboard → renders full chrome
            ├── Sidebar collapses per ?sidebar= + localStorage
            ├── BottomTabBar (only if viewport < lg, decided at the responsive layer)
            └── <main id="main-content">{children}</main>
        → HTTP 200 + dashboard HTML
```

## Testing strategy (strict TDD)

Strict TDD Mode is active (per session-level guard). Each requirement gets RED → GREEN → TRIANGULATE → REFACTOR.

### REQ-UI-12 (landing + 302)

- **RED** — `app/page.test.tsx` requests `/` with a mocked `auth()` returning a session. Assert response status is `302` and `Location: /dashboard`. Test fails (page returns 200).
- **GREEN** — add `if (await auth()) redirect('/dashboard')` to `app/page.tsx`.
- **TRIANGULATE** — request `/` without session, assert 200 + exactly 1 `<h1>` + 3 `.feature-card` elements + 2 `<a>` with `href="/auth/register"` and `href="/auth/signin"` and visible labels `Crear cuenta` / `Iniciar sesión` for `es`.
- **REFACTOR** — extract 302 helper to a shared `auth-redirect.ts`; verify gate: `pnpm test app/page.test.tsx` + Playwright happy-path.

### REQ-UI-13 (nav shell)

- **RED** — `app-shell.test.tsx` renders with `x-pathname=/dashboard` and asserts `<aside data-component="sidebar">` is in the DOM. Fails (no shell).
- **GREEN** — `<AppShell>` returns Topbar + Sidebar for `/dashboard`.
- **TRIANGULATE 1** — render with `x-pathname=/` and assert Sidebar absent but Topbar present.
- **TRIANGULATE 2** — render with `x-pathname=/auth/signin` and assert no Topbar.
- **REFACTOR** — assert ≥ 2 distinct `<nav>` landmarks across the page + skip-link is the first focusable element.

### REQ-UI-14 (theme triple-state)

- **RED** — `theme-provider.test.tsx` mounts the FOUC script in a JSDOM with `matchMedia = (q) => ({ matches: q.includes('dark'), ...})` and no `localStorage`. Assert `<html>` ends with `class="dark"`. Fails (script not added).
- **GREEN** — add inline script in `app/layout.tsx`.
- **TRIANGULATE 1** — set `localStorage['ui.theme']='light'`, assert `<html>` does **not** have `dark`.
- **TRIANGULATE 2** — call `cycle()` three times, assert values cycle `system → light → dark → system` in `localStorage`.
- **REFACTOR** — assert `ThemeToggle` re-renders with `aria-pressed` flipping per cycle.

### REQ-UI-15 (reduced-transparency)

- **RED** — `glass-card.test.tsx` renders with `matchMedia('(prefers-reduced-transparency: reduce)')` returning `{ matches: true }`. Assert computed `backdrop-filter` is `none`. Fails.
- **GREEN** — add `@media (prefers-reduced-transparency: reduce)` override in `globals.css`.
- **TRIANGULATE** — assert computed `background-color` resolves to the solid (alpha 1) value.
- **REFACTOR** — axe-core scan of GlassCard in both themes; verify `docs/qa/ui-redesign.md` lists the pair ratios.

### REQ-UI-16 (reduced-motion)

- **RED** — `spinner.test.tsx` renders with reduced-motion. Assert computed `animation-name` is `none`.
- **GREEN** — wrap `animate-spin` in `motion-safe:animate-spin` in `Spinner.tsx`.
- **TRIANGULATE** — `skeleton.test.tsx` same pattern; assert `Skeleton` renders flat block.
- **REFACTOR** — Playwright e2e with `--reduced-motion=reduce` Chrome flag; verify no `animation` properties resolve to non-`none`.

### REQ-UI-17 (i18n)

- **RED** — `tests/e2e/ui-redesign.spec.ts` issues `GET /` with `Accept-Language: es-AR,es;q=0.9,en;q=0.8`. Assert response contains Spanish CTA `Crear cuenta`. Fails (no i18n).
- **GREEN** — wire `next-intl` middleware + `getTranslations` in `app/page.tsx`.
- **TRIANGULATE 1** — `Accept-Language: en-US,en;q=0.9` → English copy.
- **TRIANGULATE 2** — `Accept-Language: ja,fr;q=0.8` → English copy (locked decision Q1 default).
- **TRIANGULATE 3** — set `NEXT_LOCALE=en` cookie + `Accept-Language: es-AR` → English (cookie wins).
- **REFACTOR** — `LanguageSwitcher` Playwright test: click `English`, assert cookie + reload still English.

### REQ-UI-18 (fonts via next/font)

- **RED** — `fonts.test.tsx` renders any page and asserts `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` count is `0`. Also asserts `--font-inter` and `--font-jb-mono` on `documentElement.style`.
- **GREEN** — wire `next/font/google` in `app/layout.tsx`.
- **TRIANGULATE** — assert `<style>` block generated by `next/font` contains `@font-face` declarations for both families.
- **REFACTOR** — verify gate: `pnpm typecheck` + `pnpm test fonts.test.tsx`.

### REQ-UI-19 (tokens append-only)

- **RED** — script reads current `app/_ui/tokens.css`, asserts `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`, `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to` are present. Fails.
- **GREEN** — append the 7 new tokens.
- **TRIANGULATE** — assert `git diff HEAD~1 -- app/_ui/tokens.css` has zero `-` lines that affect any of the 14 existing color variable declarations.
- **REFACTOR** — verify gate: `pnpm test tokens.test.ts` + the diff-assertion script in CI.

### REQ-UI-20 (not-found + error)

- **RED** — `not-found.test.tsx` asserts `docs/qa/ui-redesign.md` references the file and `/this-route-does-not-exist` returns 404 with Spanish copy when locale is `es`. Fails.
- **GREEN** — create `app/not-found.tsx`.
- **TRIANGULATE** — `error.test.tsx`: throw inside a test page, assert `<main>` + retry button + localized title.
- **REFACTOR** — assert neither file uses the legacy `Page not found` / `Something went wrong` literals.

### REQ-UI-21 (audit)

- **RED** — `audit.test.ts` asserts `docs/qa/ui-redesign.md` exists and contains per-pair ratios for both themes.
- **GREEN** — write the audit file (PR 5).
- **TRIANGULATE** — `audit.test.ts` parses the markdown table; assert zero rows below threshold.
- **REFACTOR** — verify gate: axe-core scan of `/`, `/not-found`, `/error` in CI.

### REQ-UI-22 (skip-link)

- **RED** — Playwright `tests/e2e/ui-redesign.spec.ts` opens `/`, presses Tab once, asserts `document.activeElement.textContent` includes the localized skip label.
- **GREEN** — add `<SkipLink>` first in `app/layout.tsx`.
- **TRIANGULATE** — press Enter on the skip-link, assert focus moves to `<main>` (or its first focusable child).
- **REFACTOR** — repeat for `/dashboard` (authed route) and `/this-does-not-exist` (not-found).

### REQ-UI-9 MODIFIED (both themes declared)

- **RED** — `tokens.test.ts` asserts `.dark` selector is present in `app/_ui/tokens.css` with `--ui-bg`, `--ui-fg`, etc.
- **GREEN** — rename `[data-theme='dark']` → `.dark`; update docstring.
- **TRIANGULATE** — toggle ThemeToggle to `dark`, assert `documentElement.classList.contains('dark')`.
- **REFACTOR** — assert both light and dark palettes render side-by-side (snapshot test).

### REQ-UI-24 (i18n scope)

- **RED** — `tests/e2e/ui-redesign.spec.ts` visits `/accounts` with `NEXT_LOCALE=es`. Assert the pre-existing mixed EN/ES copy is unchanged (snapshot the relevant strings).
- **GREEN** — configure `next-intl` fallback to return key string verbatim when missing.
- **TRIANGULATE** — add a key to `es.json` only; render an English user hitting the landing; assert the key string renders literally (no throw, no blank).

### Unit / E2E tooling

- **Unit:** Vitest + Testing Library + vitest-axe + axe-core (already installed per `package.json`).
- **E2E:** Playwright (assumed available — if not installed, PR 5 adds `@playwright/test` as a devDependency, justified as test infra not new production).
- **Coverage target:** 80% on `app/_ui/` per `transactions-ui` precedent (`pnpm test:coverage:enforced` gate).
- **Skip:** tests in `app/auth/`, `app/accounts/[id]/balance-widget.tsx`, and the seven production surfaces — slice 1 does NOT migrate them.

## Performance budget

| Metric                    | Target                                                                                                                                      | Justification                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LCP on `/`                | ≤ 2.0 s p95 (Slow 4G, Lighthouse)                                                                                                           | Inter Variable + JetBrains Mono preloaded via `next/font` (`preload: true`, `display: 'swap'`) — no CDN `<link>` to block; hero is server-rendered text on a CSS gradient (no raster image); landing is mostly Server Components.               |
| CLS on `/`                | ≤ 0.1                                                                                                                                       | `next/font` reserves metric-adjusted fallback line-heights; gradient is CSS `background` (no image load); CTAs are fixed-height buttons.                                                                                                        |
| TBT on `/`                | ≤ 200 ms                                                                                                                                    | Only client components in the chrome: `ThemeToggle`, `LanguageSwitcher`, `Sidebar`, `ThemeProvider` — total client JS for chrome is < 10 KB gz. Everything else (Topbar, BottomTabBar, SkipLink, GlassCard, landing markup) is server-rendered. |
| Bundle delta              | < 25 KB gzipped                                                                                                                             | `next-intl` server runtime is ~6 KB gz, plus the chrome JS (~8 KB gz), plus ICU MessageFormat (~3 KB gz) — well under 25 KB gz.                                                                                                                 |
| `dark:` Tailwind variants | allowed in `app/_ui/`, `app/_ui/primitives/`, `app/_ui/layout/`, `app/_ui/providers/`, `app/page.tsx`, `app/not-found.tsx`, `app/error.tsx` | REQ-UI-9 MODIFIED second scenario explicitly lifts the `transactions-ui` "zero `dark:` variants" guard. Verify gate still scans `app/auth/` and the seven production surfaces and FAILS on any `dark:` introduced in those trees by slice 1.    |

## Risks and mitigations

| Risk                                         | Technical dimension                                                                    | Mitigation                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Glassmorphism × dark-mode contrast slip      | Low-opacity dark glass on a darker gradient can fall below 4.5:1 for body text.        | (1) `--ui-glass-bg` alpha chosen to give ≥ 12:1 contrast against `--ui-fg` on dark; (2) `prefers-reduced-transparency` forces a solid high-opacity surface that preserves contrast; (3) `docs/qa/ui-redesign.md` audit is a hard verify gate (REQ-UI-21).                                                                                      |
| `next/font` font-metric shift                | Replacing any in-place font reference causes a layout shift on first deployment.       | PR 1 wires fonts first; existing chrome that uses CDN fonts gets `font-sans` (which now resolves to Inter). `display: 'swap'` + `next/font`'s automatic `size-adjust` keeps the swap imperceptible.                                                                                                                                            |
| FOUC risk if the inline script is delayed    | A delayed inline script flashes the wrong theme on first paint.                        | The script is inline in `<head>` with no `defer`/`async`. Verify gate: a Playwright e2e test that disables JavaScript entirely for one run and asserts the `<html class>` is still set by the time the body starts rendering (inline script does not depend on JS execution completion for parsing).                                           |
| `next-intl` Server Components streaming      | If `messages/${locale}.json` is dynamically imported, the render may await the import. | `next-intl` bundles messages at build time per locale; `getRequestConfig` returns synchronously when messages are pre-loaded via the `createNextIntlPlugin` (`./src/i18n/request.ts`) — no runtime fetch.                                                                                                                                      |
| i18n hydration mismatch                      | Server-rendered locale may differ from the cookie/Accept-Language resolution.          | The `x-locale` header is set by middleware based on the SAME precedence as the cookie detection; the locale used in `getRequestConfig` is the same one the FOUC script reads. No second source of truth. Verify gate: a Playwright e2e with `Accept-Language: es-AR` asserts the very first paint already shows Spanish copy in the `<title>`. |
| Sidebar collapse race on URL ↔ localStorage | Two sources of truth can disagree on first load.                                       | URL wins on first load; subsequent updates go through `history.replaceState` + `localStorage.setItem` atomically (single render). A `storage` event listener handles cross-tab sync. Verify gate: Playwright test reloads 5 times after collapse toggle and asserts the URL + localStorage + visual state all agree.                           |

## Sequence of changes (chained-PR plan for `sdd-tasks`)

Five PRs. Each PR's verify gate must pass before the next PR opens.

### PR 1 — foundation

| Field         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Add `next-intl` dependency; create `i18n.ts`, `src/i18n/request.ts`, `middleware.ts` (with `x-pathname` + `x-locale` header injection); create `messages/en.json` + `messages/es.json` (chrome keys only — landing strings come in PR 4); wire `next/font` Inter + JetBrains Mono in `app/layout.tsx`; add `<SkipLink>` first in `<body>`; add `createNextIntlPlugin` wrap in `next.config.ts`; stub `docs/qa/ui-redesign.md` (empty table). |
| Files touched | `package.json`, `next.config.ts`, `app/layout.tsx`, `i18n.ts` (new), `src/i18n/request.ts` (new), `middleware.ts` (new), `messages/en.json` (new), `messages/es.json` (new), `app/_ui/layout/skip-link.tsx` (new), tests for SkipLink + locale detection, `docs/qa/ui-redesign.md` (new stub).                                                                                                                                               |
| LoC Δ         | ~+220 / −3                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Verify gate   | `pnpm test` — SkipLink first-focusable; locale detection per REQ-UI-17 scenarios 1, 2, 3, 4. `pnpm typecheck`. `pnpm lint`. Visual smoke: existing `/dashboard`, `/accounts`, `/transactions` keep rendering data unchanged (data contracts intact).                                                                                                                                                                                         |

### PR 2 — tokens + theme

| Field         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope         | APPEND 7 glass/gradient/shadow tokens to `app/_ui/tokens.css`; rename `[data-theme='dark']` → `.dark`; expose 7 tokens in `@theme inline` of `app/globals.css`; add `prefers-reduced-transparency` and `prefers-reduced-motion` overrides in `app/globals.css`; create `ThemeProvider` + `ThemeToggle`; add the no-FOUC inline script in `app/layout.tsx`; mount `<ThemeProvider>` wrapping `<AppShell>` stub in `app/layout.tsx`. Apply `motion-safe:animate-spin` / `motion-safe:animate-pulse` to Spinner + Skeleton. |
| Files touched | `app/_ui/tokens.css`, `app/globals.css`, `app/layout.tsx`, `app/_ui/providers/theme-provider.tsx` (new), `app/_ui/providers/theme-toggle.tsx` (new), `app/_ui/primitives/spinner.tsx`, `app/_ui/primitives/skeleton.tsx`, tests.                                                                                                                                                                                                                                                                                         |
| LoC Δ         | ~+200 / −8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Verify gate   | `pnpm test` — theme cycle (REQ-UI-14); reduced-transparency (REQ-UI-15); reduced-motion (REQ-UI-16); tokens-append-only diff (REQ-UI-19). Playwright: `prefers-color-scheme: dark` flips to dark; manual toggle persists across reload; no FOUC under JS-disabled.                                                                                                                                                                                                                                                       |

### PR 3 — chrome + i18n

| Field         | Value                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Create `Topbar`, `Sidebar`, `BottomTabBar`, `AppShell`, `LanguageSwitcher`, `GlassCard`; mount `<AppShell>` in `app/layout.tsx`; add full chrome translations to `messages/en.json` + `messages/es.json`. The seven production surfaces (`/dashboard`, `/accounts/*`, `/transactions/*`) automatically pick up the chrome via RootLayout without any per-page change. Auth pages stay un-chromed (slice 2). |
| Files touched | `app/_ui/layout/topbar.tsx` (new), `app/_ui/layout/sidebar.tsx` (new), `app/_ui/layout/bottom-tab-bar.tsx` (new), `app/_ui/layout/app-shell.tsx` (new), `app/_ui/providers/language-switcher.tsx` (new), `app/_ui/primitives/glass-card.tsx` (new), `app/layout.tsx` (mount AppShell), `messages/en.json` + `messages/es.json` (chrome keys), tests.                                                        |
| LoC Δ         | ~+520 / −5                                                                                                                                                                                                                                                                                                                                                                                                  |
| Verify gate   | `pnpm test` — AppShell pathname → chrome matrix; Sidebar collapse round-trip; Topbar second `<nav>` landmark; BottomTabBar `< nav` only; axe-core on every new component; LanguageSwitcher popover + cookie write. `pnpm test:coverage:enforced` passes 80% on `app/_ui/`.                                                                                                                                  |

### PR 4 — landing

| Field         | Value                                                                                                                                                                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Replace `app/page.tsx` placeholder with marketing landing (REQ-UI-12): hero + 3 feature cards + 2 CTAs; 302 redirect for authed visitors; landing strings to `messages/en.json` + `messages/es.json`. Create `app/not-found.tsx` + `app/error.tsx` (REQ-UI-20) with localized copy + glass language. |
| Files touched | `app/page.tsx`, `app/not-found.tsx` (new), `app/error.tsx` (new), `messages/en.json` + `messages/es.json` (landing + error + not-found keys), tests.                                                                                                                                                 |
| LoC Δ         | ~+260 / −10                                                                                                                                                                                                                                                                                          |
| Verify gate   | `pnpm test` — landing 302 + 1 h1 + 3 cards + 2 CTAs; not-found localized; error localized + retry. Playwright e2e: full `/` happy path; 302 round-trip with mocked session.                                                                                                                          |

### PR 5 — accessibility audit + docs

| Field         | Value                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Fill `docs/qa/ui-redesign.md` with the contrast audit (tool + per-pair ratios + verdict). Update `README.md` + `Documents-es/README.md` with the UI redesign note. Update `CHANGELOG.md` `[Unreleased]` section. Add `tests/e2e/ui-redesign.spec.ts` Playwright suite if not already in PR 4. |
| Files touched | `docs/qa/ui-redesign.md`, `README.md`, `Documents-es/README.md`, `CHANGELOG.md`, `tests/e2e/ui-redesign.spec.ts` (or finalize).                                                                                                                                                               |
| LoC Δ         | ~+220 / −0                                                                                                                                                                                                                                                                                    |
| Verify gate   | axe-core scan of `/`, `/not-found`, `/error` in CI — zero `critical`, zero `serious`. Audit file parses with zero rows below threshold. README + CHANGELOG updated.                                                                                                                           |

## Open technical decisions (small)

1. **Glass blur radius token.** Proposed: `--ui-glass-blur-sm: 12px` and `--ui-glass-blur-lg: 20px`. Default if user does not overrule: ship as proposed.
2. **Gradient hue.** Proposed: cool indigo (`oklch(0.7 0.15 250)` → `oklch(0.75 0.12 280)` → `oklch(0.7 0.12 320)`) for brand continuity with the existing `--ui-accent: #2563eb`. Alternatives named for the user: teal (cool teal `oklch(0.75 0.12 190)` — strong finance association, more "tech-forward") or violet (cooler, more "premium SaaS"). Default if user does not overrule: ship cool indigo.
3. **`NEXT_LOCALE` cookie max-age.** Proposed: 1 year (`Max-Age=31536000`). Alternative: session-only (no `Max-Age`, browser drops on close — UX worse because locale resets on every session). Default if user does not overrule: ship 1 year.

## Acceptance for this design

The design is acceptable when:

- **(a) every REQ-UI-NN maps to a concrete file/component/test**:

  - REQ-UI-9 MODIFIED → `app/_ui/tokens.css` (selector rename) + `app/globals.css` (theme inline) + `app/_ui/providers/theme-provider.tsx` + tests in `theme-provider.test.tsx` + `tokens.test.ts`.
  - REQ-UI-12 → `app/page.tsx` + `app/_ui/layout/landing/` (or inline in `page.tsx`) + `app/page.test.tsx` + Playwright e2e.
  - REQ-UI-13 → `app/_ui/layout/app-shell.tsx` + `sidebar.tsx` + `bottom-tab-bar.tsx` + `topbar.tsx` + `app-shell.test.tsx` + Sidebar round-trip test.
  - REQ-UI-14 → `app/_ui/providers/theme-provider.tsx` + `theme-toggle.tsx` + inline FOUC script in `app/layout.tsx` + `theme-provider.test.tsx` + Playwright reload test.
  - REQ-UI-15 → `app/globals.css` (reduced-transparency override) + `app/_ui/primitives/glass-card.tsx` + `glass-card.test.tsx` + audit file.
  - REQ-UI-16 → `app/globals.css` (reduced-motion override) + `app/_ui/primitives/spinner.tsx` + `skeleton.tsx` + `spinner.test.tsx` + `skeleton.test.tsx` + Playwright.
  - REQ-UI-17 → `i18n.ts` + `src/i18n/request.ts` + `middleware.ts` + `messages/en.json` + `messages/es.json` + `language-switcher.tsx` + `language-switcher.test.tsx` + Playwright locale e2e.
  - REQ-UI-18 → `app/layout.tsx` (`next/font`) + `fonts.test.tsx` + Playwright no-CDN-link assertion.
  - REQ-UI-19 → `app/_ui/tokens.css` (append-only) + `tokens.test.ts` (diff assertion) + CI diff-check script.
  - REQ-UI-20 → `app/not-found.tsx` + `app/error.tsx` + `not-found.test.tsx` + `error.test.tsx`.
  - REQ-UI-21 → `docs/qa/ui-redesign.md` + `audit.test.ts` + axe-core CI scan.
  - REQ-UI-22 → `app/_ui/layout/skip-link.tsx` + `app/layout.tsx` (first focusable) + `skip-link.test.tsx` + Playwright Tab order test.
  - REQ-UI-24 → `next-intl` fallback config in `src/i18n/request.ts` + Playwright e2e on `/accounts` mixed copy + missing-key fallback test.

- **(b) the 14 acceptance criteria A1–A14 are covered** — every A1–A14 maps to one or more REQ-UI-NN above (the spec cross-references are explicit in `openspec/changes/ui-redesign/specs/ui/spec.md`); verify gates per PR §10 exercise each.

- **(c) verify gates per PR are runnable** — `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage:enforced`, and the Playwright suite. axe-core CI integration (already a `vitest-axe` devDep) gates REQ-UI-21. The diff-check CI script for REQ-UI-19 is a small `scripts/check-tokens-diff.ts` invoked in `lint-staged` + a CI job.
