# Delta for ui

**Change**: `ui-redesign` (slice 1 — foundation)
**Capability**: `ui`
**Adds requirements**: REQ-UI-12, REQ-UI-13, REQ-UI-14, REQ-UI-15, REQ-UI-16, REQ-UI-17, REQ-UI-18, REQ-UI-19, REQ-UI-20, REQ-UI-21, REQ-UI-22, REQ-UI-24 (REQ-UI-23 merged into REQ-UI-20 as instructed)
**Modifies requirements**: REQ-UI-9
**Removes requirements**: none
**Source proposal**: `openspec/changes/ui-redesign/proposal.md`
**Source explore**: `sdd/ui-redesign/explore` (Engram)

This delta hardens slice 1 of the ui-redesign change: the foundation layer that ships design tokens, the three-state theme, fonts, the navigation shell, the i18n scaffold, the marketing landing at `/`, and the root error and not-found surfaces. Slices 2 and 3 (auth migrations, balance-widget migration) are tracked in their own changes.

The locked decisions (visual style = glassmorphism over gradient; theme triple-state; fonts = Inter Variable + JetBrains Mono; i18n = `next-intl` with `messages/en.json` + `messages/es.json`; mobile-first nav shell with BottomTabBar below `lg`; landing scope; append-only tokens; and the three defaulted open questions Q1 = default `en`, Q2 = popover on `<sm`, Q3 = static-only hero on slice 1) are constraints here, not open items. Slices 2/3 inherit the foundation without re-litigating it.

## ADDED Requirements

### Requirement: marketing landing at `/` with auth-aware redirect (REQ-UI-12)

The route `/` MUST render a marketing landing for unauthenticated visitors and MUST issue a 302 redirect to `/dashboard` for visitors who present a valid Auth.js v5 session cookie. The landing MUST contain exactly: one hero block (a single `<h1>` value proposition), exactly three feature cards in a single row (collapsing to a column below Tailwind `md`), and exactly two call-to-action links labelled `Crear cuenta` (linking to `/auth/register`) and `Iniciar sesión` (linking to `/auth/signin`). The 302 redirect MUST be emitted by the route handler or Server Component before any HTML body is streamed; client-side routing MUST NOT be used for the redirect.

(Traces: A1, A2; Goal 1, User Story 1, User Story 2.)

#### Scenario: unauthenticated visitor sees the marketing landing

- GIVEN: a `GET /` request with no Auth.js v5 session cookie
- WHEN: the request reaches the route handler for `app/page.tsx`
- THEN: the response status is `200`
- AND: the response body contains a single `<h1>` element
- AND: the response body contains exactly three semantically distinct feature cards
- AND: the response body contains exactly two `<a>` elements whose `href` resolves to `/auth/register` and `/auth/signin` respectively
- AND: the visible CTA labels read `Crear cuenta` and `Iniciar sesión` for the active locale `es`

#### Scenario: authenticated visitor is 302-redirected to `/dashboard`

- GIVEN: a `GET /` request carrying a valid Auth.js v5 session cookie
- WHEN: the request reaches the route handler for `app/page.tsx`
- THEN: the response status is `302` (or `307` per Next.js default)
- AND: the `Location` response header is `/dashboard`
- AND: no HTML body is streamed (the redirect precedes render)

#### Scenario: visitor with an expired or unverifiable cookie still sees the landing

- GIVEN: a `GET /` request carrying a session cookie that Auth.js v5 cannot verify (expired, tampered, or signed with a stale secret)
- WHEN: the request reaches the route handler for `app/page.tsx`
- THEN: the response status is `200`
- AND: the landing body renders the same as for an unauthenticated visitor
- AND: no redirect to `/auth/signin` is performed from `/` itself

### Requirement: navigation shell with Topbar, Sidebar, BottomTabBar, and skip-link (REQ-UI-13)

The application MUST render a navigation shell on every authenticated route segment. On viewports with `min-width: 1024px` (Tailwind `lg`) the shell consists of a `Topbar` (horizontal, top) and a `Sidebar` (vertical, left, collapsible). On viewports with `width < 1024px` the shell consists of a `Topbar` (horizontal, top) and a `BottomTabBar` (fixed, bottom). The `Sidebar` collapse state MUST be reflected in the URL as the query parameter `?sidebar=collapsed` and MUST be mirrored in `localStorage` under the key `ui.sidebarCollapsed`; URL is the source of truth on first load, `localStorage` is the source of truth on subsequent navigations within the same origin session. A skip-to-content link MUST be the first focusable element in the document tab order (see also REQ-UI-22). The shell MUST expose at least two distinct `<nav>` landmarks: the primary navigation (Sidebar or BottomTabBar) and the user navigation (Topbar user menu, language controls, theme controls). The seven existing production surfaces — `/dashboard`, `/accounts`, `/accounts/[id]`, `/accounts/new`, `/transactions`, `/transactions/[id]`, `/transactions/new` — MUST continue to render their existing data contracts unchanged (A12); only chrome and tokens differ.

(Traces: A3, A12; Goal 2, User Story 3.)

#### Scenario: desktop ≥ lg renders Topbar + Sidebar

- GIVEN: a viewport of `1280×800` (Tailwind `lg` and above)
- WHEN: an authenticated user navigates to `/dashboard`
- THEN: the rendered DOM contains a `Topbar` element and a `Sidebar` element
- AND: the `BottomTabBar` element is NOT rendered
- AND: at least one `<nav>` element is present in the `Sidebar`
- AND: at least one `<nav>` element is present in the `Topbar`

#### Scenario: mobile < lg renders Topbar + BottomTabBar

- GIVEN: a viewport of `375×812` (Tailwind base)
- WHEN: an authenticated user navigates to `/dashboard`
- THEN: the rendered DOM contains a `Topbar` element and a `BottomTabBar` element
- AND: the `Sidebar` element is NOT rendered
- AND: the `BottomTabBar` exposes up to five destinations plus a "more" affordance

#### Scenario: Sidebar collapse round-trips through URL and localStorage

- GIVEN: an authenticated user on `/dashboard` with the Sidebar expanded
- WHEN: the user activates the sidebar collapse toggle
- THEN: the URL becomes `/dashboard?sidebar=collapsed`
- AND: `localStorage.getItem('ui.sidebarCollapsed')` returns `'true'`
- WHEN: the user reloads the page
- THEN: the Sidebar renders collapsed
- WHEN: the user navigates to `/accounts` (no query param) with the collapsed state still in `localStorage`
- THEN: the Sidebar renders collapsed
- WHEN: the user activates the collapse toggle again to expand
- THEN: the URL drops the `?sidebar=collapsed` query parameter
- AND: `localStorage.getItem('ui.sidebarCollapsed')` returns `'false'`

#### Scenario: production data contracts remain unchanged

- GIVEN: the slice 1 codebase
- WHEN: the seven production surfaces render
- THEN: each surface consumes the existing Hono endpoints (`GET /api/accounts`, `GET /api/transactions`, etc.) with the same request shape as before ui-redesign
- AND: the response shapes on those endpoints are unchanged
- AND: only the chrome (`Topbar`, `Sidebar`, `BottomTabBar`) and the tokens (`app/_ui/tokens.css`) differ from the `transactions-ui` era

### Requirement: three-state theme with manual override (REQ-UI-14)

The application MUST support three theme modes: `system`, `light`, and `dark`. The `system` mode MUST follow the `prefers-color-scheme` media query and is the default. A `ThemeToggle` control rendered in the `Topbar` MUST cycle through `system → light → dark → system` on each activation. The active mode MUST persist in `localStorage` under the key `ui.theme`. The precedence on first paint MUST be: (1) `localStorage['ui.theme']` if present and one of `'system'`, `'light'`, `'dark'`; (2) otherwise the OS `prefers-color-scheme` value (`dark` or `light`); (3) otherwise `light`. The persisted manual choice MUST override the OS preference until `localStorage['ui.theme']` is cleared. There MUST be no flash of the wrong theme on first paint: the `dark` class MUST be applied to `<html>` (or equivalent root) via an inline blocking script before the first paint, derived from the same precedence rule.

(Traces: A4; Goal 5.)

#### Scenario: first visit with `prefers-color-scheme: dark`

- GIVEN: a browser with `prefers-color-scheme: dark` and no `ui.theme` in `localStorage`
- WHEN: the user first visits any page
- THEN: `<html class="dark">` is present before first paint
- AND: the `ThemeToggle` reflects the `system` mode
- AND: the rendered palette is the dark palette from `app/_ui/tokens.css`

#### Scenario: manual toggle to `light`

- GIVEN: a browser with `prefers-color-scheme: dark`
- AND: no `ui.theme` in `localStorage`
- WHEN: the user activates the `ThemeToggle`
- THEN: the active theme is `light`
- AND: `<html>` no longer has the `dark` class
- AND: `localStorage.getItem('ui.theme')` returns `'light'`
- AND: a subsequent reload renders in `light` regardless of the OS `prefers-color-scheme` value

#### Scenario: manual toggle cycles system → light → dark → system

- GIVEN: a fresh session, `prefers-color-scheme: light`
- WHEN: the user activates the `ThemeToggle` three times in succession
- THEN: the first click sets `localStorage['ui.theme']` to `'light'`
- AND: the second click sets `localStorage['ui.theme']` to `'dark'`
- AND: the third click sets `localStorage['ui.theme']` to `'system'`
- AND: in `system` mode the rendered theme tracks the live OS preference

#### Scenario: clearing localStorage restores OS-preference default

- GIVEN: a user has manually selected `dark` so `localStorage['ui.theme'] === 'dark'`
- WHEN: the user clears `ui.theme` from `localStorage` and reloads
- THEN: the rendered theme follows `prefers-color-scheme` again

### Requirement: reduced-transparency fallback for glass surfaces (REQ-UI-15)

Every `bg-ui-glass-*` utility (and any other surface using `backdrop-filter: blur(...)` from the glass token table) MUST resolve to a flat high-opacity solid background when the user agent reports `@media (prefers-reduced-transparency: reduce)`. The fallback background MUST be the same `oklch(...)` value as the high-opacity end of the glass token (no transparency, no blur). For every text-on-background pair that appears under reduced-transparency, the contrast ratio MUST be ≥ 4.5:1 (WCAG 2.2 AA, normal text) or ≥ 3:1 (large text and UI components). The audit that establishes this — tool, per-pair ratio table, both themes — MUST be recorded at `docs/qa/ui-redesign.md` (see also REQ-UI-21).

(Traces: A5, A11; Goal 3, User Story 4, Risk R3.)

#### Scenario: reduced-transparency replaces blur with solid

- GIVEN: the OS reports `prefers-reduced-transparency: reduce`
- WHEN: a page with `bg-ui-glass-1` is rendered
- THEN: the computed style of the element has no `backdrop-filter` property (or `backdrop-filter: none`)
- AND: the computed `background-color` is the glass token's high-opacity solid value (≥ 0.9 alpha)
- AND: any text rendered on top of the surface has a contrast ratio ≥ 4.5:1 against the resolved background

#### Scenario: contrast audit is recorded under reduced-transparency

- GIVEN: the verify phase for slice 1
- WHEN: `docs/qa/ui-redesign.md` is read
- THEN: the file lists every text-on-background pair on the landing, not-found, and error surfaces under reduced-transparency
- AND: per-pair contrast ratios are tabulated for both `light` and `dark` themes
- AND: zero pairs are below 4.5:1 for normal text or below 3:1 for large text / UI components

### Requirement: reduced-motion fallback for animations (REQ-UI-16)

When the user agent reports `@media (prefers-reduced-motion: reduce)`, the following animations MUST NOT run: the `Spinner` component's `animate-spin` keyframe; the `Skeleton` component's `animate-pulse` keyframe; glass surface transition keyframes; and any landing hero animation (slice 1 ships hero as static-only per locked decision Q3). Reduced-motion users MUST see the resolved end state of every animated element immediately. Components that depend on animation for affordance (e.g. a `Spinner` that signals loading) MUST be replaced with a static visual marker (e.g. the word `Cargando…` or a non-animated glyph) when reduced motion is active.

(Traces: A6; Goal 4, User Story 5.)

#### Scenario: Spinner keyframe is disabled

- GIVEN: the OS reports `prefers-reduced-motion: reduce`
- WHEN: a `Spinner` is rendered on a loading page
- THEN: the computed `animation` property of the `Spinner` element is `none`
- AND: a static loading marker (text or glyph) is visible

#### Scenario: Skeleton keyframe is disabled

- GIVEN: the OS reports `prefers-reduced-motion: reduce`
- WHEN: a `Skeleton` placeholder renders
- THEN: the computed `animation` property of the `Skeleton` element is `none`
- AND: the placeholder renders as a flat, static block

#### Scenario: glass transitions and hero animations are disabled

- GIVEN: the OS reports `prefers-reduced-motion: reduce`
- WHEN: a glass surface's hover or focus transition is triggered
- THEN: the computed `transition` property is `none` (or a 0ms duration)
- AND: the landing hero (slice 1) renders as a static composition with no `animation-name` referencing any floating-glow or related keyframes

### Requirement: i18n scaffold with `next-intl`, EN/ES catalogs, LanguageSwitcher (REQ-UI-17)

The application MUST integrate `next-intl` for internationalization. Two locale catalogs MUST exist at `messages/en.json` and `messages/es.json`. Locale resolution MUST follow this precedence on the server: (1) the `NEXT_LOCALE` cookie value if set to `'en'` or `'es'`; (2) the `Accept-Language` request header — if the highest-weighted entry starts with `es` (e.g. `es`, `es-AR`, `es-MX`, `es-ES`), the locale is `es`; otherwise the locale is `en` (locked decision Q1: unsupported languages default to English). A `LanguageSwitcher` rendered in the `Topbar` MUST change the active locale, persist the choice in the `NEXT_LOCALE` cookie, and trigger a server-side route refresh. On viewports `width < 640px` (Tailwind `sm`) the `LanguageSwitcher` MUST collapse to a single icon that opens a popover listing `Español` and `English` (locked decision Q2); on viewports `≥ sm` the switcher MAY render as inline buttons or a dropdown. The only new production dependency permitted by this change is `next-intl` (A13); no other entry is added to `pnpm-lock.yaml`.

(Traces: A8, A13; Goal 6, User Story 6.)

#### Scenario: Spanish Accept-Language resolves to `es`

- GIVEN: a request with `Accept-Language: es-AR,es;q=0.9,en;q=0.8`
- AND: no `NEXT_LOCALE` cookie is set
- WHEN: any page renders
- THEN: the active locale is `es`
- AND: the rendered copy resolves against `messages/es.json`

#### Scenario: English Accept-Language resolves to `en`

- GIVEN: a request with `Accept-Language: en-US,en;q=0.9`
- AND: no `NEXT_LOCALE` cookie is set
- WHEN: any page renders
- THEN: the active locale is `en`
- AND: the rendered copy resolves against `messages/en.json`

#### Scenario: unsupported Accept-Language defaults to `en`

- GIVEN: a request with `Accept-Language: ja,fr;q=0.8`
- AND: no `NEXT_LOCALE` cookie is set
- WHEN: any page renders
- THEN: the active locale is `en` (locked decision Q1)

#### Scenario: NEXT_LOCALE cookie overrides Accept-Language

- GIVEN: a request with `Accept-Language: es-AR`
- AND: a `NEXT_LOCALE=en` cookie
- WHEN: any page renders
- THEN: the active locale is `en`

#### Scenario: LanguageSwitcher persists choice

- GIVEN: a user on any page
- WHEN: the user activates the `LanguageSwitcher` and picks `English`
- THEN: the `NEXT_LOCALE` cookie is set to `en`
- AND: a subsequent page load renders in English regardless of the `Accept-Language` header

#### Scenario: popover placement on very narrow viewports

- GIVEN: a viewport of `320×568` (Tailwind base, `<sm`)
- WHEN: the `Topbar` renders
- THEN: the `LanguageSwitcher` is rendered as a single icon button (not as inline text links)
- AND: activating the icon opens a popover containing the labels `Español` and `English`

### Requirement: Inter Variable + JetBrains Mono via `next/font/google` (REQ-UI-18)

Typography MUST use Inter Variable for display and body text and JetBrains Mono for monospace text. Both font families MUST be loaded via `next/font/google` with `display: 'swap'` and `preload: true`. The preloaded weights MUST be: Inter Variable at 400, 500, 600, and 700; JetBrains Mono at 400 and 500. The font loader MUST expose CSS custom properties `--font-inter` and `--font-jb-mono` on the root element. The Tailwind v4 `@theme` MUST map `--font-sans: var(--font-inter)` and `--font-mono: var(--font-jb-mono)` so that `font-sans` and `font-mono` utility classes resolve to the preloaded families. The rendered HTML MUST NOT contain a `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` (or any `<link>` pointing to the Google Fonts CDN) — the fonts MUST load only via the `next/font` pipeline. The font preload contributes to the LCP-on-`/` ≤ 2.0 s p95 target (A14) carried over from `transactions-ui`.

(Traces: A7, A14; Goal 9.)

#### Scenario: fonts resolve via `next/font`

- GIVEN: any page
- WHEN: the rendered HTML is inspected
- THEN: the `<style>` block generated by `next/font` contains `@font-face` declarations for Inter Variable and JetBrains Mono
- AND: no `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` element is present
- AND: the root element carries `--font-inter` and `--font-jb-mono` CSS custom properties

#### Scenario: Tailwind font utilities resolve to the preloaded families

- GIVEN: an element with class `font-sans`
- WHEN: the page is rendered
- THEN: the computed `font-family` resolves to the value of `var(--font-inter)`
- AND: an element with class `font-mono` resolves to `var(--font-jb-mono)`

#### Scenario: preloaded weights are present

- GIVEN: the `next/font` configuration
- WHEN: the build emits font assets
- THEN: the Inter Variable subset contains weights 400, 500, 600, 700
- AND: the JetBrains Mono subset contains weights 400, 500
- AND: each weight file carries `<link rel="preload" as="font" ...>` emitted by `next/font`

### Requirement: glassmorphism and gradient tokens are APPEND-only (REQ-UI-19)

The file `app/_ui/tokens.css` MUST be extended with the following seven CSS custom properties, declared inside `@theme` (Tailwind v4) or the equivalent `:root` block: `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`, `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to`. The 14 pre-existing color variables declared in `app/_ui/tokens.css` MUST NOT be modified — their declarations, values, and order MUST remain byte-for-byte unchanged. A `git diff` of `app/_ui/tokens.css` between the pre-ui-redesign commit and the post-slice-1 commit MUST show only additions (`+` lines) for the seven new tokens; no `−` lines are allowed against the 14 existing color variables.

(Traces: A10; locked decision "append-only tokens".)

#### Scenario: glass and gradient tokens are declared

- GIVEN: the post-slice-1 `app/_ui/tokens.css`
- WHEN: the file is read
- THEN: it declares `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`, `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to` as CSS custom properties (or Tailwind v4 theme tokens)

#### Scenario: pre-existing color variables are byte-for-byte unchanged

- GIVEN: a `git diff` between the pre-ui-redesign commit and the post-slice-1 commit on `app/_ui/tokens.css`
- WHEN: the diff is read
- THEN: the 14 pre-existing color variables appear with no `−` lines (no removals, no edits to existing values)
- AND: the diff contains only `+` lines for the seven new tokens and any required surrounding scaffolding

### Requirement: not-found and error surfaces in the new visual language (REQ-UI-20)

The files `app/not-found.tsx` and `app/error.tsx` MUST exist at the root of the App Router (`app/`, not under any sub-segment). Both surfaces MUST render in the new visual language (glass card on a gradient background, using the tokens from REQ-UI-19). The visible copy MUST be localized via `next-intl` so a Spanish user sees Spanish copy and an English user sees English copy. Each surface MUST set a sane `<title>` (via the Next.js `metadata` export or an equivalent mechanism): `not-found.tsx` MUST set a title that includes the localized phrase for not-found (e.g. `No encontrado` / `Not found`); `error.tsx` MUST set a title that includes the localized phrase for error (e.g. `Error` / `Error`). Both surfaces MUST respect the `<main>` landmark. The `not-found.tsx` surface MUST include a CTA linking to `/`. Neither surface MUST exist in the legacy English-only Tailwind style (the historical `app/not-found.tsx` shipped by `transactions-ui` had no localized copy and no glass language; this requirement REQ-UI-23-annex is folded into REQ-UI-20).

(Traces: A9; User Story 4.)

#### Scenario: not-found renders localized copy

- GIVEN: a request to `/this-route-does-not-exist`
- AND: the active locale is `es`
- WHEN: Next.js routes the request to `app/not-found.tsx`
- THEN: the response status is `404`
- AND: the rendered body contains the Spanish `No encontrado` copy
- AND: the rendered body contains a CTA link with `href="/"`
- AND: the `<title>` element reads the localized not-found title
- AND: the page contains a `<main>` landmark

#### Scenario: error surface renders localized copy

- GIVEN: any Server Component throws an unhandled exception
- WHEN: Next.js routes to `app/error.tsx`
- THEN: the rendered body contains the localized `Error` copy
- AND: a retry mechanism is exposed (either a button that calls `reset()` or a link to the same route)
- AND: the `<title>` element reads the localized error title
- AND: the page contains a `<main>` landmark

#### Scenario: not-found / error use the new visual language

- GIVEN: `app/not-found.tsx` and `app/error.tsx` as shipped in slice 1
- WHEN: the source is read
- THEN: both files reference glass / gradient tokens from `app/_ui/tokens.css` (REQ-UI-19)
- AND: neither file uses the legacy English-only Tailwind string literals (`Page not found`, `Something went wrong`, etc.) as the only copy

### Requirement: WCAG 2.2 AA contrast audit on both themes (REQ-UI-21)

A contrast audit MUST be recorded at `docs/qa/ui-redesign.md`. The audit MUST cover every new text-on-background pair introduced by slice 1 on BOTH the `light` and `dark` themes. The audit MUST record the tool used (axe-core CLI, Lighthouse, Stark, or equivalent), the per-pair contrast ratio, the WCAG 2.2 AA threshold that applies (4.5:1 for normal text, 3:1 for large text and UI components), and the pass/fail result. The audit MUST cover at minimum: the landing hero text, the three feature cards (heading, body, CTA), the not-found surface, the error surface, and the chrome controls (`Topbar`, `Sidebar` / `BottomTabBar`, `LanguageSwitcher`, `ThemeToggle`). The verify gate MUST fail unless the audit shows zero pairs below threshold.

(Traces: A11; Goal 2, Goal 8, Risk R3.)

#### Scenario: audit file exists and is linked from verify evidence

- GIVEN: the verify phase for slice 1
- WHEN: `docs/qa/ui-redesign.md` is read
- THEN: the file names the tool used
- AND: the file lists at least the surfaces enumerated above
- AND: each surface has a per-pair ratio table for both themes
- AND: the file's verdict is `PASS` (zero pairs below threshold)

#### Scenario: a glass-text pair fails the audit

- GIVEN: the audit identifies a text-on-background pair on the landing with a contrast ratio below 4.5:1 in dark mode
- WHEN: the audit is presented to the verify gate
- THEN: the verify gate fails for slice 1
- AND: the failing pair is listed in `docs/qa/ui-redesign.md` with remediation guidance (token value to adjust, target ratio, etc.)

### Requirement: skip-to-content link is the first focusable element (REQ-UI-22)

A skip-to-content link MUST be rendered as part of the root layout `app/layout.tsx`. The skip link MUST be the first focusable element in the document tab order on every page (landing, authenticated routes, not-found, error). The skip link MUST target the `<main>` landmark of the current page. The skip link MUST become visible when focused (default browser styling is acceptable; the link MUST NOT be permanently hidden via `display: none` or `visibility: hidden`).

(Traces: A3; Goal 2.)

#### Scenario: keyboard user reaches the skip link first

- GIVEN: any page in the application
- WHEN: a keyboard user presses Tab exactly once from the address bar
- THEN: focus lands on the skip-to-content link
- AND: the link is visibly focused (focus ring or equivalent)

#### Scenario: activating the skip link jumps to `<main>`

- GIVEN: focus is on the skip-to-content link
- WHEN: the user presses Enter or Space
- THEN: the browser scrolls focus to the `<main>` element of the current page
- AND: focus moves to the first focusable element inside `<main>` (or to `<main>` itself if it has `tabindex="-1"`)

### Requirement: i18n surface scope for slice 1 (REQ-UI-24)

For slice 1, the i18n catalogs `messages/en.json` and `messages/es.json` MUST resolve strings only on the surfaces introduced by this change: the marketing landing at `/`, the `not-found.tsx` and `error.tsx` surfaces, and the chrome (`Topbar`, `Sidebar`, `BottomTabBar`, `LanguageSwitcher`, `ThemeToggle`, navigation labels). The seven production surfaces shipped by the archived `transactions-ui` change — `/dashboard`, `/accounts`, `/accounts/[id]`, `/accounts/new`, `/transactions`, `/transactions/[id]`, `/transactions/new` — MUST remain in their current language mix (mixed EN/ES as documented in the canonical ui spec §Glossary under `Mixed EN/ES copy`); slice 1 MUST NOT migrate their copy. The `next-intl` fallback MUST be configured so that any key present in one catalog but missing in the other returns the present key verbatim, never throws, and never blocks render.

(Traces: Out of Scope list in `openspec/changes/ui-redesign/proposal.md`.)

#### Scenario: production surfaces stay in their current language mix

- GIVEN: a Spanish-speaking user (`NEXT_LOCALE=es` or `es*` `Accept-Language`) on `/accounts` in slice 1
- WHEN: the page renders
- THEN: the page renders the same copy it shipped before ui-redesign (mixed EN/ES, per the canonical ui spec's `Mixed EN/ES copy` glossary entry)
- AND: no translated copy is forced into the production surface

#### Scenario: missing translation key falls back to the key string

- GIVEN: a string key `landing.cta.primary` exists in `messages/es.json` but is absent in `messages/en.json`
- WHEN: an English user hits the landing
- THEN: the rendered CTA text is the literal string `landing.cta.primary` (no throw, no blank space, no stack trace)
- AND: the verify gate MAY log a missing-key warning

## MODIFIED Requirements

### Requirement: v1 ships a single light theme (REQ-UI-9)

The application MUST support three theme modes — `system`, `light`, and `dark` — wired through `prefers-color-scheme` plus a manual `ThemeToggle` in the `Topbar`. The token table at `app/_ui/tokens.css` MUST declare light-mode values as the defaults and dark-mode values under the `.dark` selector (or equivalent CSS scope). Both light and dark values MUST be present in the file at the end of slice 1; the dark tokens are activated via the `<html class="dark">` toggling established in REQ-UI-14. Manual override persists in `localStorage` under `ui.theme`; precedence is manual > OS preference > default (see REQ-UI-14).

(Previously: "v1 ships a single light theme. The token table at `app/_ui/tokens.css` MAY declare dark-mode token values via CSS custom properties (so the follow-up `ui-dark-mode` change is non-breaking), but v1 MUST NOT render the dark tokens. The dashboard MUST NOT include a theme toggle." — superseded by ui-redesign's three-state theme; the `<html class="dark">` mechanism replaces the v1 `dark:` Tailwind variant guard.)

#### Scenario: both themes are declared and dark is active when toggled

- GIVEN: `app/_ui/tokens.css` after slice 1
- WHEN: the file is read
- THEN: light-mode values are the defaults
- AND: dark-mode values are declared under the `.dark` selector
- AND: a user toggling the `ThemeToggle` to `dark` causes the rendered UI to switch palette without a reload

#### Scenario: dark Tailwind variants are allowed and resolve

- GIVEN: the slice 1 codebase
- WHEN: `git grep` runs for `dark:` inside `app/_ui/`, `app/accounts/`, `app/transactions/`, `app/dashboard/`, `app/_components/`
- THEN: `dark:` Tailwind variants MAY appear (the original `transactions-ui` "zero `dark:` variants" guard no longer applies)
- AND: any `dark:` variant resolves to a value declared under the `.dark` selector in `app/_ui/tokens.css`
