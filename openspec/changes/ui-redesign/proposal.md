# Proposal — `ui-redesign`

## Change ID: `ui-redesign`

## Status: `proposed`

## Authors

- Project — `gastos-personales` (v0.4.1, multi-user personal finance app on Next.js 16 / React 19 / Hono / Prisma 6 / PostgreSQL).
- This proposal — `sdd-propose` phase, change `ui-redesign`.

## Summary

Replace the ad-hoc Tailwind defaults and placeholder `/` shipped by the archived `transactions-ui` change (closed 2026-06-29) with a cohesive visual system and navigation shell: glassmorphism over gradient backgrounds, full light/dark theme with `prefers-color-scheme` auto + manual override, mobile-first nav shell (BottomTabBar on mobile, Topbar + collapsible Sidebar on desktop), EN/ES i18n, WCAG 2.2 AA with `prefers-reduced-transparency` and `prefers-reduced-motion` fallbacks, and a marketing landing page at `/` that 302-redirects authenticated visitors to `/dashboard`. Slice 1 ships only the foundation — design tokens, fonts, theme, i18n scaffold, nav shell, landing, and `not-found.tsx` / `error.tsx` — so subsequent slices can migrate `signin`, `register`, and the `balance-widget` without redesigning the chassis.

## Why

The explore (`sdd/ui-redesign/explore`, 2026-06-29) inventoryed what the shipped UI got right (preservation list) and what it got wrong (pain points file-anchored to production code). The blockers, anchored to `transactions-ui` outputs:

- **`app/_ui/tokens.css`** ships 14 default Tailwind palette colors and no glass tokens, gradient stops, or dark-mode pairings. Every surface reimplements its own combination.
- **`app/_ui/primitives/Card.tsx`** and **`app/_components/transactions/TransactionList.tsx`** render flat colors with no depth language, so the brand voice ("warm, trustworthy") reads as "default Tailwind demo".
- **`app/(public)/page.tsx`** is an unauthenticated placeholder; the product has no marketing surface and an authenticated user lands on `?callbackUrl=/` confusion.
- **`app/auth/signin/page.tsx`, `app/auth/register/page.tsx`** hardcode English strings inside JSX (`"Sign in"`, `"Continue with Google"`); no i18n layer.
- **`app/_ui/primitives/Spinner.tsx`, `Skeleton.tsx`** have no `prefers-reduced-motion` opt-out.
- **`app/accounts/[id]/balance-widget/`** uses backdrop-blur with no `prefers-reduced-transparency` fallback; below WCAG 2.2 AA in dark mode at low opacity.
- **Sidebar** lives only at desktop ≥ `lg`; no mobile equivalent — five of seven production pages are unusable below `md`.
- **`app/_ui/primitives/Button.tsx`** uses Inter from the CDN, not `next/font/google`, so non-preloaded weights block LCP.
- The landing renders English copy with no locale switch; the project's documented primary user reads Spanish (per `Documents-es/README.md` and Spanish mirror tree).
- The user (in session) described the shipped feel as "esto da asco" — a tonal failure, not a code-quality failure.

The gap is product-shaped, not code-shaped: a `transactions-ui` PR closed with all tests green and a critic emoji the maintainer would rather not see in the next session.

## What changes

User-visible change set, grouped by surface. "Slice 1" labels mark in-scope work; "later slice" labels are explicitly out of scope.

### Surface 1 — Visual system (Slice 1)

- Glassmorphism tokens appended to `app/_ui/tokens.css` (APPEND-only — the 14 existing colors are not modified): `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`, plus gradient stops `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to`.
- Gradient backgrounds (calm, on-brand) for the landing and as the substrate under glass cards.
- Shadow + elevation tokens for layers (`--ui-shadow-1` … `--ui-shadow-4`).

### Surface 2 — Theme (Slice 1)

- `light`, `dark`, and `system` (`prefers-color-scheme`) themes. A `ThemeToggle` in the Topbar flips to manual. Manual choice persists in `localStorage` under `ui.theme` and overrides the OS preference.
- `@custom-variant dark` plus a `.dark` class wiring; compatible with the existing Tailwind v4 setup.

### Surface 3 — Fonts (Slice 1)

- Inter Variable for display and body (`next/font/google`, `display: 'swap'`, preloaded).
- JetBrains Mono for monospace (`next/font/google`, `display: 'swap'`, subset preloaded).
- Applied via CSS variables `--font-inter`, `--font-jb-mono`; available as Tailwind v4 theme tokens (`font-sans`, `font-mono`).

### Surface 4 — Navigation shell (Slice 1)

- `Topbar` (horizontal, top) — logo + brand on the left; on the right: `LanguageSwitcher`, `ThemeToggle`, user menu.
- `Sidebar` (collapsible, vertical, left, desktop ≥ `lg`) — section list with active-route highlight; collapse state in URL (`?sidebar=collapsed`) and mirrored in `localStorage`.
- `BottomTabBar` (mobile < `lg`) — up to 5 destinations: dashboard, accounts, transactions, reports (or similar), plus a "more" affordance.
- Both shells expose `<nav>` landmarks, are operable by keyboard only, and have skip-to-content links.

### Surface 5 — i18n (Slice 1)

- `next-intl` scaffold (the only plausible production newcomer; flagged for spec confirmation): `messages/en.json`, `messages/es.json`, locale negotiation from header + URL prefix optional, `LanguageSwitcher` in Topbar persists choice in cookie.
- Slice 1 ships empty/seed message catalogs; strings are filled as each surface migrates.

### Surface 6 — Landing at `/` (Slice 1)

- Marketing-driven for unauthenticated visitors: hero with one clear value prop, three feature cards, dual CTA ("Crear cuenta" / "Iniciar sesión").
- Spanish-first copy (the project's documented primary reader); English mirror.
- Authenticated visitors who hit `/` are 302-redirected server-side to `/dashboard`.
- No charts, no animated demos, no third-party widgets in slice 1.

### Surface 7 — Error + not-found (Slice 1)

- `app/not-found.tsx` and `app/error.tsx` (root scope) match the new visual language: glass card, gradient background, copy in both locales, sane `<title>` tags.

### Surface 8 — Future migrations (later slices — OUT OF SCOPE)

- `app/auth/signin/page.tsx` — migrate to glass + new tokens + EN/ES copy.
- `app/auth/register/page.tsx` — same migration.
- `app/accounts/[id]/balance-widget/` — migrate to glass with `prefers-reduced-transparency` fallback, audit WCAG 2.2 AA contrast.
- Dashboard charts — gated until a chart stack is decided (chart.js, recharts, etc.).
- Reports redesign, settings page, forgot-password page, cookie banner (lawful basis), analytics.

## Goals

1. A user opening `/` on a clean profile understands within five seconds what the app is and how to start.
2. Every interactive element on every new surface meets WCAG 2.2 AA: 4.5:1 contrast for body text, 3:1 for large text and UI components, visible focus rings, ≥ 44×44 px touch targets, full keyboard reach, no color-only state.
3. `prefers-reduced-transparency` collapses glass blur to high-opacity solid surfaces while preserving contrast.
4. `prefers-reduced-motion` disables Spinner, Skeleton, and glass transition animations.
5. The `ThemeToggle` choice survives reload; it overrides `prefers-color-scheme`.
6. The `LanguageSwitcher` choice survives reload; `es` is the default locale for browsers requesting Spanish; `en` for everyone else.
7. The production shell — `/dashboard`, `/accounts`, `/transactions`, `/accounts/:id`, `/transactions/:id`, `/accounts/new`, `/transactions/new` — keeps working unchanged at the route-data layer; only the chrome and tokens differ.
8. Light and dark themes render identically for layout; contrast passes on both for every new text-on-background pair.
9. LCP on `/` ≤ 2.0 s p95 on a throttled "Slow 4G" profile (with Inter preloaded; this target is forwarded from `transactions-ui`).
10. Zero new production dependencies beyond `next-intl` (and only if the spec confirms it — `next/font` ships with Next.js).

## Non-goals

- **Migrate** `app/auth/signin/page.tsx` — slice 2.
- **Migrate** `app/auth/register/page.tsx` — slice 2.
- **Migrate** `app/accounts/[id]/balance-widget/` — slice 3.
- **Add** charts to the landing.
- **Add** charts to `/dashboard`.
- **Redesign** the reports page or the settings page.
- **Add** a forgot-password page (separate change).
- **Add** a cookie banner or analytics — separate changes once lawful basis is decided.
- **Touch** route data contracts, business logic, or Prisma models.
- **Modify** the 14 existing color tokens in `app/_ui/tokens.css` — glass tokens are APPEND-only.
- **Force** users to a manual theme pick — `system` is the default; manual override is opt-in.
- **Ship** translations for copy outside the new surfaces (signin, register, balance-widget stay Spanish/English as they are today).

## User stories

1. **As a first-time visitor**, I land on `/`, see a clear value proposition in my language (Spanish by default), and find "Crear cuenta" / "Iniciar sesión" within one screen-flick — without bouncing because the page is in the wrong language or looks like a placeholder.
2. **As a returning authenticated user**, I land on `/` after my session expires and the server bounces me to `/dashboard`, not to the marketing page — so I am not asked to re-authenticate via a marketing CTA.
3. **As a mobile user** on a 360 px viewport, I see a BottomTabBar with my most-used destinations and the same visual style as on desktop — not a "use a bigger screen" placeholder.
4. **As a user with `prefers-reduced-transparency: reduce`**, every glass card falls back to a solid background with the same contrast; I can still see content, the page does not "vanish" into transparency, and I do not have to disable a system setting.
5. **As a user with `prefers-reduced-motion: reduce`**, I see no spinner/skeleton choreography; the page simply resolves into its final state, and I am not asked to confirm a one-off accessibility override per surface.
6. **As a Spanish-speaking user**, I can switch the entire app to English from the Topbar, my choice survives a reload, and the language switch is reachable from any page (Topbar, not a footer link).

## Acceptance criteria

The spec phase will harden these into role-agnostic, testable REQ-UI-NN scenarios. This proposal carries the high-level shape.

- **A1.** `/` renders the marketing landing for unauthenticated visitors; the layout includes one hero, exactly three feature cards, and exactly two CTAs that point to `/auth/register` and `/auth/signin` respectively.
- **A2.** `/` 302-redirects to `/dashboard` when the request carries a valid session cookie; the redirect happens server-side, not via client routing.
- **A3.** Every authenticated route renders with the shell (Topbar + Sidebar on ≥ `lg`, Topbar + BottomTabBar on < `lg`); the shell is keyboard-operable, has a skip-link, and exposes distinct `<nav>` landmarks.
- **A4.** The default theme follows `prefers-color-scheme`. A `ThemeToggle` in the Topbar cycles `system → light → dark`. The manual choice persists in `localStorage` under `ui.theme` and overrides the OS preference.
- **A5.** When `prefers-reduced-transparency: reduce` is set, all glass surfaces swap blur for a high-opacity solid background; the contrast ratio of every text-on-background pair still satisfies WCAG 2.2 AA.
- **A6.** When `prefers-reduced-motion: reduce` is set, no Spinner/Skeleton/CSS-keyframe animation runs; the page resolves into its final state without motion.
- **A7.** Inter Variable (display + body) and JetBrains Mono (mono) load via `next/font/google` with `display: 'swap'` and `preload: true`; no `<link>` to a Google Fonts CDN is rendered.
- **A8.** The `LanguageSwitcher` changes the active locale; the choice persists; `messages/en.json` and `messages/es.json` exist and at least the landing strings resolve.
- **A9.** `app/not-found.tsx` and `app/error.tsx` exist at root, render in the new visual language, and copy is localized.
- **A10.** Glass and dark/light tokens are APPENDED to `app/_ui/tokens.css`; the 14 pre-existing color variables are untouched (a diff of the file shows only additions).
- **A11.** Every new text-on-background pair on both themes passes WCAG 2.2 AA contrast; the audit results are recorded in `docs/qa/ui-redesign.md`.
- **A12.** The existing production shell pages (`/dashboard`, `/accounts`, `/transactions`, and their detail/new variants) keep rendering without route-data changes; only chrome and tokens differ.
- **A13.** No new production dependency is added beyond `next-intl` (if confirmed in spec); `next/font` is used as shipped with Next.js.
- **A14.** LCP on `/` ≤ 2.0 s p95 on a "Slow 4G" throttled Lighthouse profile (carry-over target from `transactions-ui`).

## Product tradeoffs

- **Chained PRs vs one big PR.** The locked decision is chained PRs. Tradeoff: slice 1 stays reviewable (< ~400 changed lines per PR, with the existing 18 primitives + 5 layout shells touching one surface per PR), but the user sees a half-finished product for longer and we accept that some interim states are visually inconsistent (landing is glass, signin is still flat) until slice 2 lands. **Why this wins:** the explore named reviewability, partial rollback, and lower blast radius as the deciding factors; a single ~1.5k-line PR would re-open the "esto da asco" tone question every time a reviewer comments. The cost is roughly a week of mixed-era surfaces, which we mitigate by NOT touching `signin` / `register` / `balance-widget` until their dedicated slices — so their current (ugly-but-functional) look holds the line on usability.
- **`next-intl` vs hand-rolled i18n.** Adding `next-intl` is the only material new dependency. Tradeoff: another transitive surface to learn and patch, another thing on the dependency review checklist. **Why this wins:** the App Router + Server Components integration story for `next-intl` is mature (RSC + streaming + ICU MessageFormat + cookie-based locale negotiation), and rolling our own message-format + plural + locale-n negotiation + tree-shakeable bundle would be ~200 LOC of `src/i18n/` we have to maintain. The spec phase confirms the choice; if `next-intl` is rejected, fallback is `react-i18next` (older but battle-tested) or a thin custom wrapper, and the proposal reopens.
- **Landing at `/` vs login at `/`.** We redirect authenticated `/` traffic to `/dashboard`. Tradeoff: a "marketing first" landing does double duty as a signin wall for browser bookmarks that pointed at `/`; the redirect from `/` to `/dashboard` is one extra server hop for the authed case. **Why this wins:** the alternative (jump straight to `/auth/signin` from `/`) costs every unauthenticated visitor a screen-flick of friction; the alternative (a `?` query param to opt into marketing) is too leaky (deep links, ad-tracking pixels, and bookmarks fragment). We revisit if analytics show a high unauthenticated revisit rate.
- **`prefers-color-scheme: light+dark+auto` vs single manual choice.** Three modes. Tradeoff: more toggle states to test, more edge cases on first-load. **Why this wins:** brand requirement is "warm, trustworthy, never shouty"; a forced dark default would alienate daytime desktop users, a forced light default would alienate mobile evening users, and a single auto-only path removes user agency. The three-state cycle (`system → light → dark`) is the industry default and is what power-users expect.
- **Append-only tokens vs refactor.** We append glass / gradient / shadow tokens to `app/_ui/tokens.css` without modifying the 14 existing colors. Tradeoff: the file grows, two eras of tokens coexist during the migration window. **Why this wins:** every code path that uses `--color-primary` keeps behaving; we can migrate one surface at a time and roll back surface-by-surface. The cleanup PR is the last slice in the chain, not part of slice 1.

## Open product questions

The locked decisions cover most of the proposal surface. Three small ones remain; the spec phase can proceed regardless and the apply phase confirms them in their dedicated PRs. They are listed so the user can short-circuit them with one line each if they want to.

1. **Locale default for browsers whose language is neither Spanish nor English.** Proposal: default to English, accept the URL prefix `?lang=` and locale cookie as the only override. **Smallest input that unblocks:** "default English" or "default Spanish." Default of `en` if unanswered.
2. **`LanguageSwitcher` placement when the viewport is < sm (very narrow phones) and the Topbar is already crowded.** Proposal: collapse to a single icon that opens a popover with `Español` / `English`. **Smallest input that unblocks:** "popover" or "dedicated row" or "footer link." Default of popover if unanswered.
3. **Landing hero animation.** A brief floating-glow on the hero illustration under `motion-ok` users only. Proposal: include the animation gated by `prefers-reduced-motion`. **Smallest input that unblocks:** "ship with animation" or "static-only on slice 1." Default of static-only if unanswered, to keep slice 1 the boring-safe slice.

## Out of scope (slice 1)

Explicit list, to lock the scope of the chained-PR sequence:

- `app/auth/signin/page.tsx` — migration to glass + EN/ES copy (slice 2).
- `app/auth/register/page.tsx` — migration (slice 2).
- `app/accounts/[id]/balance-widget/` — migration + `prefers-reduced-transparency` audit (slice 3).
- Forgot-password page — separate change, not part of this slice.
- Reports redesign — separate change.
- Settings page — separate change.
- Charts on `/dashboard` — separate change; chart stack not yet chosen.
- Charts on the landing — separate change.
- Cookie banner / lawful basis — separate change.
- Analytics integration — separate change.
- Token cleanup PR (remove pre-glass token era) — last slice, not slice 1.
- Localized copy beyond the landing + theme/language toggle + not-found/error — moved incrementally per surface migration slice.

## Risks

Product and business risks only. Technical risks (rendering perf, hydration, bundle bloat) belong to the design phase.

- **R1 — Scope creep on landing.** A landing page invites copywriters, illustrators, and SEO stakeholders; without a fence, slice 1 grows from "tokens + nav + landing" into "marketing site". **Mitigation:** the Out of Scope list above; any new request is filed under a new SDD change, not absorbed here.
- **R2 — Scope under-delivery.** Slice 1 ships only the foundation, so authed users see an inconsistent visual era for ~1–2 weeks until slice 2 lands. **Mitigation:** the maintainer's "esto da asco" complaint is named in this proposal's Why; we ship slice 1 with the most-visible parts (landing, Topbar) so the emotional payoff arrives fast, not in slice 3.
- **R3 — Accessibility regression on glass in dark mode.** Glass surfaces are notorious for contrast slip in dark mode (low-opacity white over dark gradient falls under 4.5:1 for body text). **Mitigation:** REQ-UI-21 mandates a recorded contrast audit (`docs/qa/ui-redesign.md`); `prefers-reduced-transparency` is a hard opt-out, not a "preference".
- **R4 — Broken-English on the landing for the primary Spanish-speaking reader.** The locked decision is Spanish-first copy on `/`. If the brand voice reads as Google-Translated, the launch tone is worse than the placeholder. **Mitigation:** landing copy is drafted by the maintainer before slice 1 ships (the maintainer can route to a reviewer with Spanish fluency); the spec phase treats the message catalog for the landing as a deliverable, not a placeholder.
- **R5 — Brand-tone drift toward "glass demo app".** Glassmorphism is fashionable; without restraint the app reads as a Dribbble shot rather than a finance tool. **Mitigation:** tone guidance "warm + professional (never playful-shouty, never corporate-cold)" is a goal; A11 enforces gradient backgrounds and shadows as conservative; the landing copy uses second-person ("Tus cuentas, tus reglas") rather than first-person-y selfie.
- **R6 — Persistence contract failure between Engram and OpenSpec.** This proposal lands in Engram at `sdd/ui-redesign/proposal` AND on disk at `openspec/changes/ui-redesign/proposal.md` AND as a Spanish mirror at `Documents-es/openspec/changes/ui-redesign/proposal.md`. **Mitigation:** the spec phase reads both English sources and re-confirms drift before proceeding; any future edit to `proposal.md` MUST land both sides in the same commit (per `AGENTS.md` §5.4 and §13.3).

## Success measure

A two-tier success criterion. Quantitative is a UX proxy; qualitative is the maintainer's tone-of-voice feedback that originally surfaced the gap.

**Quantitative**

- LCP on `/` ≤ 2.0 s p95 (Lighthouse, throttled "Slow 4G", 4 runs median) — carry-over target from `transactions-ui`.
- CLS on `/` ≤ 0.1.
- axe-core a11y suite at `tests/a11y/` for the new `/`, `not-found`, and `error` surfaces: zero `critical`, zero `serious` violations on WCAG 2.2 AA.
- `localStorage.getItem('ui.theme')` set within 30 days for > 50% of authed sessions (manual theme override adoption).
- `localStorage` locale set within 30 days for > 60% of authed sessions (manual language override adoption).

**Qualitative**

- The maintainer, in the next session after slice 1 ships, does not type "esto da asco" or any equivalent "this is rough" tone marker when describing `/`, the Topbar, or the dark theme.
- A first-time visitor can name the product's purpose within five seconds of landing on `/`.

## ADDED Requirements

Preliminary requirement statements for `sdd-spec` to harden into role-agnostic scenarios under the `ui` capability. Numbering continues from the existing `ui` capability spec — REQ-UI-12 onward.

- **REQ-UI-12** — The `/` route renders a marketing landing for unauthenticated visitors — hero with one value proposition, exactly three feature cards, and two CTAs (`Crear cuenta` → `/auth/register`, `Iniciar sesión` → `/auth/signin`) — and 302-redirects authenticated users to `/dashboard`. The redirect is server-side.
- **REQ-UI-13** — A global navigation shell renders on every authenticated route: `Topbar` + `Sidebar` on desktop ≥ `lg`, `Topbar` + `BottomTabBar` on viewports < `lg`. Both shells expose distinct `<nav>` landmarks, are operable by keyboard only, and persist collapse state (Sidebar) in URL query + `localStorage`. A skip-to-content link is the first focusable element.
- **REQ-UI-14** — Dark mode is triggered by `prefers-color-scheme: dark` AND by a manual `ThemeToggle` in the Topbar cycling `system → light → dark`. The manual choice persists in `localStorage` under `ui.theme` and overrides the OS preference until cleared.
- **REQ-UI-15** — Every glass surface honors `@media (prefers-reduced-transparency: reduce)` by replacing `backdrop-filter: blur(...)` with a high-opacity solid background that preserves WCAG 2.2 AA contrast for the text-on-background pair.
- **REQ-UI-16** — Every animated surface honors `@media (prefers-reduced-motion: reduce)` by disabling CSS keyframes for `Spinner`, `Skeleton`, glass transitions, and hero animations.
- **REQ-UI-17** — An i18n layer ships with `messages/en.json` and `messages/es.json`; a `LanguageSwitcher` in the Topbar changes the active locale; the choice persists; `es` is the default locale for browsers with `Accept-Language` headed by `es*`.
- **REQ-UI-18** — Typography uses Inter Variable for display and body and JetBrains Mono for mono, both loaded via `next/font/google` with `display: 'swap'` and `preload: true`; CSS variables `--font-inter` and `--font-jb-mono` are wired into the Tailwind v4 theme as `font-sans` and `font-mono`. No `<link>` to a Google Fonts CDN is rendered.
- **REQ-UI-19** — Glassmorphism tokens (`--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`) and gradient stops (`--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to`) are added to `app/_ui/tokens.css` as APPEND-only tokens; the 14 existing color variables are not modified (diff shows additions only).
- **REQ-UI-20** — `app/not-found.tsx` and `app/error.tsx` exist at root scope, render in the new visual language, and copy is localized to the active locale with sane `<title>` tags.
- **REQ-UI-21** — WCAG 2.2 AA contrast is verified for every new text-on-background pair on BOTH light and dark themes; the audit (tool + results, per-pair ratio) is recorded in `docs/qa/ui-redesign.md` and the file is linked from the spec's verification evidence.
